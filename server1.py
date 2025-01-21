import os
import re
import shutil
import atexit
import json
import asyncio
import time
from typing import List, Dict, Any
import yaml
import numpy as np
import chardet
from loguru import logger
from fastapi import FastAPI, WebSocket, APIRouter
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect
import uvicorn

# Bilibili imports
# -*- coding: utf-8 -*-
import asyncio
import http.cookies
import random
from typing import *

import aiohttp

import blivedm
import blivedm.models.web as web_models

from main import OpenLLMVTuberMain
from live2d_model import Live2dModel
from tts.stream_audio import AudioPayloadPreparer
import __init__

TEST_ROOM_IDS = [5624404]  # Replace with your desired Bilibili room IDs
#tuzi 30015166
#donggua 5624404
SESSDATA = '1a3d4708%2C1750656364%2C39f05%2Ac2CjBYSCiFItUml9nvWN-gporagHBlYvCbOAsVgbmLCtcTsDiadRR_V-kDpEYhhUetJk4SVnBhQkxwSmt4bngtcjlrQ3o2T01CS3p4a1l4dUhpNVNadXl3NDRHSkR0bms5WGZKNGM1NTN1SzNaTkdZcTJoT3AzRDVqaG01OGdJbklKMFFlbUpGR2hRIIEC'

class WebSocketServer:
    def __init__(self, open_llm_vtuber_main_config: Dict | None = None):
        logger.info(f"t41372/Open-LLM-VTuber, version {__init__.__version__}")
        self.app = FastAPI()
        self.router = APIRouter()
        self.connected_clients: List[WebSocket] = []
        self.open_llm_vtuber_main_config = open_llm_vtuber_main_config

        self.preload_models = self.open_llm_vtuber_main_config.get("SERVER", {}).get(
            "PRELOAD_MODELS", False
        )

        if self.preload_models:
            logger.info("Preloading ASR and TTS models...")
            logger.info(
                "Using: " + str(self.open_llm_vtuber_main_config.get("ASR_MODEL"))
            )
            logger.info(
                "Using: " + str(self.open_llm_vtuber_main_config.get("TTS_MODEL"))
            )

            self.model_manager = ModelManager(self.open_llm_vtuber_main_config)
            self.model_manager.initialize_models()
        else:
            self.model_manager = ModelManager(self.open_llm_vtuber_main_config)


        self._setup_routes()
        self._mount_static_files()
        self.app.include_router(self.router)



    async def run_bilibili_client(self):
        """
        Run the Bilibili client as a background task.
        Whenever a new danmaku message arrives, we feed it into conversation_chain.
        """
        await self.init_bilibili_session()
        room_id = TEST_ROOM_IDS[0]
        client = blivedm.BLiveClient(room_id, session=self.session)
        handler = MyBiliHandler(self.open_llm_vtuber)
        client.set_handler(handler)

        client.start()
        try:
            await client.join()
        finally:
            await client.stop_and_close()

    async def init_bilibili_session(self):
        cookies = http.cookies.SimpleCookie()
        cookies['SESSDATA'] = SESSDATA
        cookies['SESSDATA']['domain'] = 'bilibili.com'

        self.session = aiohttp.ClientSession()
        self.session.cookie_jar.update_cookies(cookies)

    async def _handle_config_switch(
        self, websocket: WebSocket, config_file: str
    ) -> tuple[Live2dModel, OpenLLMVTuberMain] | None:
        new_config = self._load_config_from_file(config_file)
        if new_config:
            try:
                if self.preload_models:
                    self.model_manager.update_models(new_config)

                self.open_llm_vtuber_main_config.update(new_config)
                l2d, open_llm_vtuber, _ = self._initialize_components(websocket)

                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "config-switched",
                            "message": f"Switched to config: {config_file}",
                        }
                    )
                )
                await websocket.send_text(
                    json.dumps({"type": "set-model", "text": l2d.model_info})
                )
                logger.info(f"Configuration switched to {config_file}")

                # Update the main vtuber instance as well
                self.l2d = l2d
                self.open_llm_vtuber = open_llm_vtuber
                return l2d, open_llm_vtuber

            except Exception as e:
                logger.error(f"Error switching configuration: {e}")
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": f"Error switching configuration: {str(e)}",
                        }
                    )
                )
                return None
        return None

    def _initialize_components(
        self, websocket: WebSocket | None
    ) -> tuple[Live2dModel, OpenLLMVTuberMain, AudioPayloadPreparer]:
        l2d = Live2dModel(self.open_llm_vtuber_main_config["LIVE2D_MODEL"])

        custom_asr = (
            self.model_manager.cache.get("asr") if self.preload_models else None
        )
        custom_tts = (
            self.model_manager.cache.get("tts") if self.preload_models else None
        )

        open_llm_vtuber = OpenLLMVTuberMain(
            self.open_llm_vtuber_main_config,
            custom_asr=custom_asr,
            custom_tts=custom_tts,
        )

        audio_preparer = AudioPayloadPreparer()

        def _websocket_audio_handler(
            sentence: str | None, filepath: str | None
        ) -> None:
            if filepath is None:
                logger.info("No audio to be streamed. Response is empty.")
                return

            if sentence is None:
                sentence = ""

            logger.info(f"Playing {filepath}...")
            payload, duration = audio_preparer.prepare_audio_payload(
                audio_path=filepath,
                display_text=sentence,
                expression_list=l2d.extract_emotion(sentence),
            )
            logger.info("Payload prepared")

            # If we have a websocket, send through it. Otherwise, just log.
            if websocket is not None:
                async def _send_audio():
                    await websocket.send_text(json.dumps(payload))
                    await asyncio.sleep(duration)

                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                new_loop.run_until_complete(_send_audio())
                new_loop.close()
            else:
                # No websocket here, we are probably initializing at startup
                # You can decide what to do in this scenario (e.g. just log)
                print("no websocket")
                pass

            logger.info("Audio played")

        open_llm_vtuber.set_audio_output_func(_websocket_audio_handler)
        return l2d, open_llm_vtuber, audio_preparer

    def _setup_routes(self):
        @self.app.websocket("/client-ws")
        async def websocket_endpoint(websocket: WebSocket):
            await websocket.accept()
            await websocket.send_text(
                json.dumps({"type": "full-text", "text": "建立链接"})
            )

            self.connected_clients.append(websocket)
            print("Connection established")
            l2d, open_llm_vtuber, _ = self._initialize_components(websocket)
            self.open_llm_vtuber=open_llm_vtuber

            # Start Bilibili listener in background
            asyncio.create_task(self.run_bilibili_client())
            await websocket.send_text(
                json.dumps({"type": "set-model", "text": l2d.model_info})
            )
            print("Model set")
            received_data_buffer = np.array([])
            # start mic
            await websocket.send_text(
                json.dumps({"type": "control", "text": "start-mic"})
            )

            conversation_task = None

            try:
                while True:
                    print(".", end="")
                    message = await websocket.receive_text()
                    data = json.loads(message)

                    if data.get("type") == "interrupt-signal":
                        if conversation_task is not None:
                            print(
                                "\033[91mLLM hadn't finish itself. Interrupting it...",
                                "heard response: \n",
                                data.get("text"),
                                "\033[0m\n",
                            )
                            open_llm_vtuber.interrupt(data.get("text"))
                    elif data.get("type") == "mic-audio-data":
                        received_data_buffer = np.append(
                            received_data_buffer,
                            np.array(list(data.get("audio").values()), dtype=np.float32),
                        )
                        print("*", end="")
                    elif data.get("type") in ["mic-audio-end", "text-input"]:
                        print("Received audio data end from front end.")
                        await websocket.send_text(
                            json.dumps({"type": "full-text", "text": "思考中..."})
                        )
                        if data.get("type") == "text-input":
                            user_input = data.get("text")
                        else:
                            user_input: np.ndarray | str = received_data_buffer

                        received_data_buffer = np.array([])

                        async def _run_conversation():
                            try:
                                await websocket.send_text(
                                    json.dumps(
                                        {
                                            "type": "control",
                                            "text": "conversation-chain-start",
                                        }
                                    )
                                )
                                await asyncio.to_thread(
                                    open_llm_vtuber.conversation_chain,
                                    user_input=user_input,
                                )
                                await websocket.send_text(
                                    json.dumps(
                                        {
                                            "type": "control",
                                            "text": "conversation-chain-end",
                                        }
                                    )
                                )
                                print("One Conversation Loop Completed")
                            except asyncio.CancelledError:
                                print("Conversation task was cancelled.")
                            except InterruptedError as e:
                                print(f"😢Conversation was interrupted. {e}")

                        conversation_task = asyncio.create_task(_run_conversation())
                    elif data.get("type") == "fetch-configs":
                        config_files = self._scan_config_alts_directory()
                        await websocket.send_text(
                            json.dumps({"type": "config-files", "files": config_files})
                        )
                    elif data.get("type") == "switch-config":
                        config_file = data.get("file")
                        if config_file:
                            result = await self._handle_config_switch(
                                websocket, config_file
                            )
                            if result:
                                l2d, open_llm_vtuber = result
                    elif data.get("type") == "fetch-backgrounds":
                        bg_files = self._scan_bg_directory()
                        await websocket.send_text(
                            json.dumps({"type": "background-files", "files": bg_files})
                        )
                    else:
                        print("Unknown data type received.")

            except WebSocketDisconnect:
                self.connected_clients.remove(websocket)
                # We do not reset the main vtuber instance here, because it's global now.

    def _scan_config_alts_directory(self) -> List[str]:
        config_files = ["conf.yaml"]
        config_alts_dir = self.open_llm_vtuber_main_config.get(
            "CONFIG_ALTS_DIR", "config_alts"
        )
        for root, _, files in os.walk(config_alts_dir):
            for file in files:
                if file.endswith(".yaml"):
                    config_files.append(file)
        return config_files

    def _load_config_from_file(self, filename: str) -> Dict:
        if filename == "conf.yaml":
            return load_config_with_env("conf.yaml")

        config_alts_dir = self.open_llm_vtuber_main_config.get(
            "CONFIG_ALTS_DIR", "config_alts"
        )
        file_path = os.path.join(config_alts_dir, filename)

        if not os.path.exists(file_path):
            logger.error(f"Config file not found: {file_path}")
            return None

        encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "ascii"]
        content = None

        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as file:
                    content = file.read()
                    break
            except UnicodeDecodeError:
                continue

        if content is None:
            try:
                with open(file_path, "rb") as file:
                    raw_data = file.read()
                detected = chardet.detect(raw_data)
                if detected["encoding"]:
                    content = raw_data.decode(detected["encoding"])
            except Exception as e:
                logger.error(
                    f"Error detecting encoding for config file {file_path}: {e}"
                )
                return None

        try:
            return yaml.safe_load(content)
        except yaml.YAMLError as e:
            logger.error(f"Error parsing YAML from {file_path}: {e}")
            return None

    def _scan_bg_directory(self) -> List[str]:
        bg_files = []
        bg_dir = os.path.join("static", "bg")
        for root, _, files in os.walk(bg_dir):
            for file in files:
                if file.endswith((".jpg", ".jpeg", ".png", ".gif")):
                    bg_files.append(file)
        return bg_files

    def _mount_static_files(self):
        self.app.mount(
            "/live2d-models",
            StaticFiles(directory="live2d-models"),
            name="live2d-models",
        )
        self.app.mount("/", StaticFiles(directory="./static", html=True), name="static")

    def run(self, host: str = "127.0.0.1", port: int = 8000, log_level: str = "info"):
        uvicorn.run(self.app, host=host, port=port, log_level=log_level)

    @staticmethod
    def clean_cache():
        cache_dir = "./cache"
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            os.makedirs(cache_dir)

    def clean_up(self):
        self.clean_cache()
        self.model_manager.cache.clear()


def load_config_with_env(path) -> dict:
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()

    pattern = re.compile(r"\$\{(\w+)\}")

    def replacer(match):
        env_var = match.group(1)
        return os.getenv(env_var, match.group(0))

    content = pattern.sub(replacer, content)
    return yaml.safe_load(content)


class ModelCache:
    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Any:
        return self._cache.get(key)

    def set(self, key: str, model: Any) -> None:
        self._cache[key] = model

    def remove(self, key: str) -> None:
        self._cache.pop(key, None)

    def clear(self) -> None:
        self._cache.clear()


class ModelManager:
    def __init__(self, config: Dict):
        self.config = config
        self._old_config = config.copy()
        self.cache = ModelCache()

    def initialize_models(self) -> None:
        if self.config.get("VOICE_INPUT_ON", False):
            self._init_asr()
        if self.config.get("TTS_ON", False):
            self._init_tts()

    def _init_asr(self) -> None:
        from asr.asr_factory import ASRFactory
        asr_model = self.config.get("ASR_MODEL")
        asr_config = self.config.get(asr_model, {})
        self.cache.set("asr", ASRFactory.get_asr_system(asr_model, **asr_config))
        logger.info(f"ASR model {asr_model} loaded successfully")

    def _init_tts(self) -> None:
        from tts.tts_factory import TTSFactory
        tts_model = self.config.get("TTS_MODEL")
        tts_config = self.config.get(tts_model, {})
        self.cache.set("tts", TTSFactory.get_tts_engine(tts_model, **tts_config))
        logger.info(f"TTS model {tts_model} loaded successfully")

    def update_models(self, new_config: Dict) -> None:
        if self._should_reinit_asr(new_config):
            self.config = new_config
            self._update_asr()
        if self._should_reinit_tts(new_config):
            self.config = new_config
            self._update_tts()

        self._old_config = new_config.copy()
        self.config = new_config

    def _should_reinit_asr(self, new_config: Dict) -> bool:
        if self._old_config.get("VOICE_INPUT_ON") != new_config.get("VOICE_INPUT_ON"):
            return True

        old_model = self._old_config.get("ASR_MODEL")
        new_model = new_config.get("ASR_MODEL")
        if old_model != new_model:
            return True

        if old_model:
            old_model_config = self._old_config.get(old_model, {})
            new_model_config = new_config.get(old_model, {})
            if old_model_config != new_model_config:
                return True

        return False

    def _should_reinit_tts(self, new_config: Dict) -> bool:
        if self._old_config.get("TTS_ON") != new_config.get("TTS_ON"):
            return True

        old_model = self._old_config.get("TTS_MODEL")
        new_model = new_config.get("TTS_MODEL")
        if old_model != new_model:
            return True

        if old_model:
            old_model_config = self._old_config.get(old_model, {})
            new_model_config = new_config.get(old_model, {})
            if old_model_config != new_model_config:
                return True

        return False

    def _update_asr(self) -> None:
        if self.config.get("VOICE_INPUT_ON", False):
            logger.info("Reinitializing ASR...")
            self._init_asr()
        else:
            logger.info("ASR disabled in new configuration")
            self.cache.remove("asr")

    def _update_tts(self) -> None:
        if self.config.get("TTS_ON", False):
            logger.info("Reinitializing TTS...")
            self._init_tts()
        else:
            logger.info("TTS disabled in new configuration")
            self.cache.remove("tts")


GIFT_COOLDOWN_SECONDS = 20
MAX_NORMAL_QUEUE_SIZE = 50
IDLE_CHECK_INTERVAL = 0.1

SHORT_MESSAGE_EXPIRY_SECONDS = 30  # Expiry for short normal messages (≤10 chars)
LONG_MESSAGE_EXPIRY_SECONDS = 120   # Expiry for long normal messages (>10 chars)
GIFT_MESSAGE_AGE_THRESHOLD = 60
IDLE_THRESHOLD = 30

class MyBiliHandler(blivedm.BaseHandler):
    def __init__(self, vtuber_instance: OpenLLMVTuberMain):
        super().__init__()
        self.vtuber_instance = vtuber_instance

        # Three queues:
        self.must_answer_queue = asyncio.Queue()
        self.gift_queue = asyncio.Queue()
        self.message_queue = asyncio.Queue()

        self.last_gift_times: Dict[str, float] = {}
        self.last_processed_time = time.time()

        self.idle_prompts = [
            "兔孜放歌",
            "这么无聊接着放歌吧",
            "来点音乐活跃气氛"
        ]

        # Start consumer
        asyncio.create_task(self._consumer_task())

    async def _consumer_task(self):
        while True:
            # 1) Must-answer queue first
            if not self.must_answer_queue.empty():
                timestamp, user_input_str, is_gift = await self.must_answer_queue.get()
                await self._process_message(timestamp, user_input_str, is_gift=False, must_answer=True)
                self.must_answer_queue.task_done()
                self.last_processed_time = time.time()

            # 2) Gift queue second
            elif not self.gift_queue.empty():
                timestamp, user_input_str, is_gift = await self.gift_queue.get()
                await self._process_message(timestamp, user_input_str, is_gift=True, must_answer=False)
                self.gift_queue.task_done()
                self.last_processed_time = time.time()

            # 3) Normal queue third
            elif not self.message_queue.empty():
                timestamp, user_input_str, is_gift = await self.message_queue.get()
                await self._process_message(timestamp, user_input_str, is_gift=False, must_answer=False)
                self.message_queue.task_done()
                self.last_processed_time = time.time()
            else:
                # All queues are empty
                # if time.time() - self.last_processed_time > IDLE_THRESHOLD:
                #     await self._add_idle_message(IDLE_THRESHOLD)
                #     self.last_processed_time = time.time()
                await asyncio.sleep(IDLE_CHECK_INTERVAL)

    async def _process_message(self, timestamp: float, user_input_str: str,
                               is_gift: bool, must_answer: bool):
        """
        Main logic for deciding whether to skip or handle the message.
        If this message is literally the LAST one in all queues,
        do NOT skip it even if it has expired.
        """
        age = time.time() - timestamp

        # Check if all queues are empty now (besides this one message we just got).
        # If so, it's effectively the "last" message.
        queues_are_empty = (
            self.must_answer_queue.empty() and
            self.gift_queue.empty() and
            self.message_queue.empty()
        )

        # Must-answer messages are never skipped
        if must_answer:
            pass
        elif is_gift:
            # Gift message might append thank you if older than threshold
            if (age > GIFT_MESSAGE_AGE_THRESHOLD) and (not queues_are_empty):
                # If it's old AND not the last message, append a short thank you
                user_input_str += " {一句话感谢我}"
        else:
            # Normal message logic
            msg_len = len(user_input_str)
            expiry = LONG_MESSAGE_EXPIRY_SECONDS if msg_len > 15 else SHORT_MESSAGE_EXPIRY_SECONDS

            # If older than expiry and not the last message, discard
            if (age > expiry) and (not queues_are_empty):
                print(f"Discarding normal message due to age > {expiry}s: {user_input_str}")
                return

        # If we get here, we do handle the message
        await self._handle_message(user_input_str)

    async def _handle_message(self, user_input_str: str):
        response = await asyncio.to_thread(self.vtuber_instance.conversation_chain, user_input_str)
        print(f"Bilibili AI Response: {response}")

    def _should_skip_gift(self, uname: str) -> bool:
        now = time.time()
        last_time = self.last_gift_times.get(uname, 0)
        if now - last_time < GIFT_COOLDOWN_SECONDS:
            return True
        self.last_gift_times[uname] = now
        return False

    async def _add_message_to_queue(self, user_input_str: str, is_gift: bool):
        """
        If message starts with '#', it becomes must-answer; otherwise gift or normal queue.
        """
        timestamp = time.time()
        trimmed_input = user_input_str.strip()
        if trimmed_input.startswith("#"):
            trimmed_input = trimmed_input[1:].strip()
            await self.must_answer_queue.put((timestamp, trimmed_input, False))
            print(f"Added must-answer message: {trimmed_input}")
            return

        if is_gift:
            await self.gift_queue.put((timestamp, trimmed_input, True))
        else:
            if self.message_queue.qsize() < MAX_NORMAL_QUEUE_SIZE:
                await self.message_queue.put((timestamp, trimmed_input, False))
            else:
                print("Message queue full, skipping non-gift message")

    async def _add_idle_message(self, threshold):
        if self.message_queue.qsize() < MAX_NORMAL_QUEUE_SIZE:
            idle_message = random.choice(self.idle_prompts)
            print(f"No messages for >{threshold}s, adding idle prompt: {idle_message}")
            timestamp = time.time()
            await self.message_queue.put((timestamp, idle_message, False))
        else:
            print("Message queue full, cannot add idle prompt.")

    def _on_heartbeat(self, client: blivedm.BLiveClient, message: web_models.HeartbeatMessage):
        print(f'[{client.room_id}] 心跳')

    def _on_danmaku(self, client: blivedm.BLiveClient, message: web_models.DanmakuMessage):
        print(f'[{client.room_id}] {message.uname}: {message.msg}')
        asyncio.create_task(self._add_message_to_queue(f'{message.uname}: {message.msg}', False))

    def _on_gift(self, client: blivedm.BLiveClient, message: web_models.GiftMessage):
        print(f'[{client.room_id}] {message.uname} 赠送 {message.gift_name}x{message.num}')
        if self._should_skip_gift(message.uname):
            print(f"Skipping gift from {message.uname} due to cooldown.")
            return
        asyncio.create_task(self._add_message_to_queue(
            f'{message.uname} 赠送 {message.gift_name}x{message.num} [真的礼物]',
            True
        ))

    def _on_buy_guard(self, client: blivedm.BLiveClient, message: web_models.GuardBuyMessage):
        print(f'[{client.room_id}] {message.username} 购买 {message.gift_name}')
        if self._should_skip_gift(message.username):
            print(f"Skipping guard buy from {message.username} due to cooldown.")
            return
        asyncio.create_task(self._add_message_to_queue(
            f'{message.username} 购买 {message.gift_name} [真的礼物]',
            True
        ))

    def _on_super_chat(self, client: blivedm.BLiveClient, message: web_models.SuperChatMessage):
        print(f'[{client.room_id}] 醒目留言 ¥{message.price} {message.uname}: {message.message}')
        if self._should_skip_gift(message.uname):
            print(f"Skipping super chat from {message.uname} due to cooldown.")
            return
        asyncio.create_task(self._add_message_to_queue(
            f'醒目留言 ¥{message.price} {message.uname}: {message.message} [真的礼物]',
            True
        ))


if __name__ == "__main__":
    atexit.register(WebSocketServer.clean_cache)

    config = load_config_with_env("conf.yaml")
    config["LIVE2D"] = True

    server = WebSocketServer(open_llm_vtuber_main_config=config)
    server.run(host=config["HOST"], port=config["PORT"])
