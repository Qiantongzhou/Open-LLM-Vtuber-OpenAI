import http
import json
import os
import sys
import re
import random
import shutil
import atexit
import threading
import queue
import uuid
import asyncio
from typing import Callable, Iterator, Optional
from loguru import logger
import numpy as np
import yaml
import chardet

import aiohttp
import blivedm
import blivedm.models.web as web_models

import __init__
from aifunctions.playsongfunction import playsongfunction
from asr.asr_factory import ASRFactory
from asr.asr_interface import ASRInterface
from live2d_model import Live2dModel
from llm.llm_factory import LLMFactory
from llm.llm_interface import LLMInterface
from prompts import prompt_loader
from tts.tts_factory import TTSFactory
from tts.tts_interface import TTSInterface
from translate.translate_interface import TranslateInterface
from translate.translate_factory import TranslateFactory
from utils.audio_preprocessor import audio_filter

TEST_ROOM_IDS = [5624404]  # Change this to the room you want to monitor
SESSDATA = 'f720b3a4%2C1749954481%2Cd0e6b%2Ac2CjA_Vi_vivcoKfKfB8X6_vjvH7bGDdf7LL9EbW_eBuOtHbdrvXxQ078mfT-BWdZsvywSVkZJX1Y0S0N4dDJkX2dpT08tLWxQaHJHM05SamxqdHdibnVCa1pBTGhnVkQwcFBGSXo4YUhPSklENFVBLXJtRlRUSDNXZWZnSWhHNWplSnFBQlBNUGh3IIEC'

class OpenLLMVTuberMain:
    """
    The main class for the OpenLLM VTuber.
    It initializes the Live2D controller, ASR, TTS, and LLM based on the provided configuration.
    Run `conversation_chain` to start one conversation (user_input -> llm -> speak).
    """

    EXEC_FLAG_CHECK_TIMEOUT = 8  # seconds

    def __init__(
        self,
        configs: dict,
        custom_asr: ASRInterface | None = None,
        custom_tts: TTSInterface | None = None,
    ) -> None:
        logger.info(f"t41372/Open-LLM-VTuber, version {__init__.__version__}")

        self.config: dict = configs
        self.verbose = self.config.get("VERBOSE", False)
        self.live2d: Live2dModel | None = self.init_live2d()
        self._continue_exec_flag = threading.Event()
        self._continue_exec_flag.set()  # Set the flag to continue execution
        self.session_id: str = str(uuid.uuid4().hex)
        self.heard_sentence: str = ""
        self.songFunc=playsongfunction()
        # Init ASR if voice input is on.
        self.asr: ASRInterface | None
        if self.config.get("VOICE_INPUT_ON", False):
            # if custom_asr is provided, don't init asr and use it instead.
            if custom_asr is None:
                self.asr = self.init_asr()
            else:
                print("Using custom ASR")
                self.asr = custom_asr
        else:
            self.asr = None

        # Init TTS if TTS is on.
        self.tts: TTSInterface
        if self.config.get("TTS_ON", False):
            # if custom_tts is provided, don't init tts and use it instead.
            if custom_tts is None:
                self.tts = self.init_tts()
            else:
                print("Using custom TTS")
                self.tts = custom_tts
        else:
            self.tts = None

        # Init Translator if enabled
        self.translator: TranslateInterface | None
        if self.config.get("TRANSLATE_AUDIO", False):
            try:
                translate_provider = self.config.get("TRANSLATE_PROVIDER", "DeepLX")
                self.translator = TranslateFactory.get_translator(
                    translate_provider=translate_provider,
                    **self.config.get(translate_provider, {}),
                )
            except Exception as e:
                print(f"Error initializing Translator: {e}")
                print("Proceed without Translator.")
                self.translator = None
        else:
            self.translator = None

        self.llm: LLMInterface = self.init_llm()

    # Initialization methods

    def init_live2d(self) -> Live2dModel | None:
        if not self.config.get("LIVE2D", False):
            return None
        try:
            live2d_model_name = self.config.get("LIVE2D_MODEL")
            live2d_controller = Live2dModel(live2d_model_name)
        except Exception as e:
            print(f"Error initializing Live2D: {e}")
            print("Proceed without Live2D.")
            return None
        return live2d_controller

    def init_llm(self) -> LLMInterface:
        llm_provider = self.config.get("LLM_PROVIDER")
        llm_config = self.config.get(llm_provider, {})
        system_prompt = self.get_system_prompt()

        llm = LLMFactory.create_llm(
            llm_provider=llm_provider, SYSTEM_PROMPT=system_prompt, **llm_config
        )
        return llm

    def init_asr(self) -> ASRInterface:
        asr_model = self.config.get("ASR_MODEL")
        asr_config = self.config.get(asr_model, {})
        asr = ASRFactory.get_asr_system(asr_model, **asr_config)
        return asr

    def init_tts(self) -> TTSInterface:
        tts_model = self.config.get("TTS_MODEL", "pyttsx3TTS")
        tts_config = self.config.get(tts_model, {})
        return TTSFactory.get_tts_engine(tts_model, **tts_config)

    def set_audio_output_func(
        self, audio_output_func: Callable[[Optional[str], Optional[str]], None]
    ) -> None:
        self._play_audio_file = audio_output_func

    def get_system_prompt(self) -> str:
        if self.config.get("PERSONA_CHOICE"):
            system_prompt = prompt_loader.load_persona(
                self.config.get("PERSONA_CHOICE")
            )
        else:
            system_prompt = self.config.get("DEFAULT_PERSONA_PROMPT_IN_YAML")

        if self.live2d is not None:
            system_prompt += prompt_loader.load_util(
                self.config.get("LIVE2D_Expression_Prompt")
            ).replace("[<insert_emomap_keys>]", self.live2d.emo_str)

        if self.verbose:
            print("\n === System Prompt ===")
            print(system_prompt)

        return system_prompt

    # Main conversation methods

    def conversation_chain(self, user_input: str | np.ndarray | None = None) -> str:
        if not self._continue_exec_flag.wait(
            timeout=self.EXEC_FLAG_CHECK_TIMEOUT
        ):  # Wait for the flag to be set
            print(
                ">> Execution flag not set. In interruption state for too long. Resetting the flag and exiting the conversation chain."
            )
            self._continue_exec_flag.set()
            raise InterruptedError(
                "Conversation chain interrupted. Wait flag timeout reached."
            )

        # Generate a random number between 0 and 3
        color_code = random.randint(0, 3)
        c = [None] * 4
        # Define the color codes for red, blue, green, and white
        c[0] = "\033[91m"
        c[1] = "\033[94m"
        c[2] = "\033[92m"
        c[3] = "\033[0m"

        print(f"{c[color_code]}New Conversation Chain started!")

        if user_input is None:
            user_input = self.get_user_input()
        elif isinstance(user_input, np.ndarray):
            print("transcribing...")
            user_input = self.asr.transcribe_np(user_input)

        if user_input.strip().lower() == self.config.get("EXIT_PHRASE", "exit").lower():
            print("Exiting...")
            # Instead of exit(), we just return a goodbye message
            return "Goodbye!"

        print(f"User input: {user_input}")

        chat_completion: Iterator[str] = self.llm.chat_iter(user_input)

        if not self.config.get("TTS_ON", False):
            full_response = ""
            for char in chat_completion:
                if not self._continue_exec_flag.is_set():
                    self._interrupt_post_processing()
                    print("\nInterrupted!")
                    return None
                full_response += char
                print(char, end="")
            print()  # newline after printing
            return full_response

        full_response = self.speak(chat_completion)
        if self.verbose:
            print(f"\nComplete response: [\n{full_response}\n]")

        print(f"{c[color_code]}Conversation completed.")
        return full_response

    def get_user_input(self) -> str:
        if self.config.get("VOICE_INPUT_ON", False):
            print("Listening from the microphone...")
            return self.asr.transcribe_with_local_vad()
        else:
            return input("\n>> ")

    def speak(self, chat_completion: Iterator[str]) -> str:
        full_response = ""
        if self.config.get("SAY_SENTENCE_SEPARATELY", True):
            full_response = self.speak_by_sentence_chain(chat_completion)
        else:
            full_response = ""
            for char in chat_completion:
                if not self._continue_exec_flag.is_set():
                    print("\nInterrupted!")
                    self._interrupt_post_processing()
                    return None
                print(char, end="")
                full_response += char
            print("\n")
            filename = self._generate_audio_file(full_response, "temp")

            if self._continue_exec_flag.is_set():
                self._play_audio_file(
                    sentence=full_response,
                    filepath=filename,
                )
            else:
                self._interrupt_post_processing()

        return full_response

    def _generate_audio_file(self, sentence: str, file_name_no_ext: str,emotion=None) -> str | None:
        if self.verbose:
            print(f">> generating {file_name_no_ext}...")

        if not self.tts:
            return None

        print("json_str")
        sentence = sentence.strip()
        if sentence == "":
            return None
            # Check if the sentence is a JSON containing an action


        # Now generate audio with the extracted emotion if any
        return self.tts.generate_audio(sentence, file_name_no_ext=file_name_no_ext, emotion=emotion)

    def _play_audio_file(self, sentence: str | None, filepath: str | None) -> None:
        if filepath is None:
            print("No audio to be streamed. Response is empty.")
            return

        if sentence is None:
            sentence = ""

        try:
            if self.verbose:
                print(f">> Playing {filepath}...")
            self.tts.play_audio_file_local(filepath)
            self.tts.remove_file(filepath, verbose=self.verbose)
        except ValueError as e:
            if str(e) == "Audio is empty or all zero.":
                print("No audio to be streamed. Response is empty.")
            else:
                raise e
        except Exception as e:
            print(f"Error playing the audio file {filepath}: {e}")

    def speak_by_sentence_chain(self, chat_completion: Iterator[str]) -> str:
        task_queue = queue.Queue()
        full_response = [""]  # Use a list to store the full response
        interrupted_error_event = threading.Event()

        def producer_worker():
            try:
                index = 0
                sentence_buffer = ""

                for char in chat_completion:
                    if not self._continue_exec_flag.is_set():
                        raise InterruptedError("Producer interrupted")

                    if char:
                        print(char, end="", flush=True)
                        sentence_buffer += char
                        full_response[0] += char
                        if self.is_complete_sentence(sentence_buffer):
                            print("sentence")
                            audio_filepath=None
                            # Extract emotion from the sentence if present
                            # Assuming emotion is indicated like [happy], [sad], [angry], etc.
                            emotion_pattern = r"\[([a-zA-Z0-9_]+)\]"
                            matches = re.findall(emotion_pattern, sentence_buffer)
                            emotion = None
                            if matches:
                                # If multiple emotions are found, decide how to handle it.
                                # For simplicity, let's use the first one.
                                emotion = matches[0]
                                # Remove all emotion tags from the sentence
                                sentence_buffer = re.sub(emotion_pattern, "", sentence_buffer)

                            json_pattern = r'(\{.*?\})'
                            match = re.search(json_pattern, sentence_buffer)
                            action = None
                            if match:
                                json_str = match.group(1)
                                print("json_str1")
                                sentence_buffer=sentence_buffer.replace(match.group(1), "").strip()
                                try:
                                    data = json.loads(json_str)
                                    action = data.get("action", None)
                                except json.JSONDecodeError:
                                    pass


                            if self.verbose:
                                print("\n")
                            if not self._continue_exec_flag.is_set():
                                raise InterruptedError("Producer interrupted")
                            tts_target_sentence = sentence_buffer

                            tts_target_sentence = audio_filter(
                                tts_target_sentence,
                                translator=(
                                    self.translator
                                    if self.config.get("TRANSLATE_AUDIO", False)
                                    else None
                                ),
                                remove_special_char=self.config.get(
                                    "REMOVE_SPECIAL_CHAR", True
                                ),
                            )
                            if action == "play_song":
                                # Remove the JSON part from the sentence to "clean it up"
                                # For example, just strip out the matched JSON substring

                                # You might do something with cleaned_sentence if needed,
                                # e.g. read it out first, or ignore it.
                                # For now, we assume we just go to play a random song.
                                print("playsong")
                                audio_filepath = self.songFunc._get_song_audio_file_path(None)
                                if self.verbose:
                                    print(f"Action detected: play_song. Returning song file {audio_filepath}")
                            else:

                                audio_filepath = self._generate_audio_file(
                                    tts_target_sentence, file_name_no_ext=str(uuid.uuid4()),emotion=emotion
                                )

                            if not self._continue_exec_flag.is_set():
                                raise InterruptedError("Producer interrupted")
                            audio_info = {
                                "sentence": sentence_buffer,
                                "audio_filepath": audio_filepath,
                            }
                            task_queue.put(audio_info)
                            index += 1
                            sentence_buffer = ""

                            if sentence_buffer:
                                if not self._continue_exec_flag.is_set():
                                    raise InterruptedError("Producer interrupted")
                                print("\n")
                                audio_filepath = self._generate_audio_file(
                                    sentence_buffer, file_name_no_ext=str(uuid.uuid4())
                                )
                                audio_info = {
                                    "sentence": sentence_buffer,
                                    "audio_filepath": audio_filepath,
                                }
                                task_queue.put(audio_info)

            except InterruptedError:
                print("\nProducer interrupted")
                interrupted_error_event.set()
                return
            except Exception as e:
                print(
                    f"Producer error: Error generating audio for sentence: '{sentence_buffer}'.\n{e}",
                    "Producer stopped\n",
                )
                return
            finally:
                task_queue.put(None)  # Signal end of production

        def consumer_worker():
            self.heard_sentence = ""

            while True:
                try:
                    if not self._continue_exec_flag.is_set():
                        raise InterruptedError("😱Consumer interrupted")

                    audio_info = task_queue.get(timeout=0.1)
                    if audio_info is None:
                        break  # End of production
                    if audio_info:
                        self.heard_sentence += audio_info["sentence"]
                        self._play_audio_file(
                            sentence=audio_info["sentence"],
                            filepath=audio_info["audio_filepath"],
                        )
                    task_queue.task_done()
                except queue.Empty:
                    continue
                except InterruptedError as e:
                    print(f"\n{str(e)}, stopping worker threads")
                    interrupted_error_event.set()
                    return
                except Exception as e:
                    print(
                        f"Consumer error: Error playing sentence '{audio_info['sentence']}'.\n {e}"
                    )
                    continue

        producer_thread = threading.Thread(target=producer_worker)
        consumer_thread = threading.Thread(target=consumer_worker)

        producer_thread.start()
        consumer_thread.start()

        producer_thread.join()
        consumer_thread.join()

        if interrupted_error_event.is_set():
            self._interrupt_post_processing()
            raise InterruptedError(
                "Conversation chain interrupted: consumer model interrupted"
            )

        print("\n\n --- Audio generation and playback completed ---")
        return full_response[0]

    def interrupt(self, heard_sentence: str = "") -> None:
        self._continue_exec_flag.clear()
        self.llm.handle_interrupt(heard_sentence)

    def _interrupt_post_processing(self) -> None:
        self._continue_exec_flag.set()  # Reset the interrupt flag

    def _check_interrupt(self):
        if not self._continue_exec_flag.is_set():
            raise InterruptedError("Conversation chain interrupted: checked")

    def is_complete_sentence(self, text: str):
        white_list = [
            "...",
            "Dr.",
            "Mr.",
            "Ms.",
            "Mrs.",
            "Jr.",
            "Sr.",
            "St.",
            "Ave.",
            "Rd.",
            "Blvd.",
            "Dept.",
            "Univ.",
            "Prof.",
            "Ph.D.",
            "M.D.",
            "U.S.",
            "U.K.",
            "U.N.",
            "E.U.",
            "U.S.A.",
            "U.K.",
            "U.S.S.R.",
            "U.A.E.",
        ]

        for item in white_list:
            if text.strip().endswith(item):
                return False

        punctuation_blacklist = [
            ".",
            "?",
            "!",
            "。",
            "；",
            "？",
            "！",
            "…",
            "〰",
            "〜",
            "～",
            "！",
            "……",
            "？",
            "}"
        ]
        return any(text.strip().endswith(punct) for punct in punctuation_blacklist)

    def clean_cache(self):
        cache_dir = "./cache"
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            os.makedirs(cache_dir)

    def load_and_apply_config(self, config_file: str) -> None:
        with open(config_file, "r", encoding="utf-8") as file:
            new_config = yaml.safe_load(file)

        self.config.update(new_config)
        self.live2d = self.init_live2d()
        self.asr = self.init_asr()
        self.tts = self.init_tts()
        self.translator = self.init_translator()
        self.llm = self.init_llm()

    def init_translator(self) -> TranslateInterface | None:
        if self.config.get("TRANSLATE_AUDIO", False):
            try:
                translate_provider = self.config.get("TRANSLATE_PROVIDER", "DeepLX")
                translator = TranslateFactory.get_translator(
                    translate_provider=translate_provider,
                    **self.config.get(translate_provider, {}),
                )
                return translator
            except Exception as e:
                print(f"Error initializing Translator: {e}")
                print("Proceed without Translator.")
                return None
        else:
            return None


def load_config_with_env(path) -> dict:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Config file not found: {path}")

    encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "ascii"]
    content = None

    for encoding in encodings:
        try:
            with open(path, "r", encoding=encoding) as file:
                content = file.read()
                break
        except UnicodeDecodeError:
            continue

    if content is None:
        try:
            with open(path, "rb") as file:
                raw_data = file.read()
            detected = chardet.detect(raw_data)
            if detected["encoding"]:
                content = raw_data.decode(detected["encoding"])
        except Exception as e:
            logger.error(f"Error detecting encoding for config file {path}: {e}")
            raise UnicodeError(f"Failed to decode config file {path} with any encoding")

    pattern = re.compile(r"\$\{(\w+)\}")

    def replacer(match):
        env_var = match.group(1)
        return os.getenv(env_var, match.group(0))

    content = pattern.sub(replacer, content)

    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as e:
        logger.error(f"Error parsing YAML from {path}: {e}")
        raise


# Bilibili integration

class MyHandler(blivedm.BaseHandler):
    def __init__(self, vtuber_instance: OpenLLMVTuberMain):
        super().__init__()
        self.vtuber_instance = vtuber_instance

    def _on_heartbeat(self, client: blivedm.BLiveClient, message: web_models.HeartbeatMessage):
        print(f'[{client.room_id}] 心跳')

    def _on_danmaku(self, client: blivedm.BLiveClient, message: web_models.DanmakuMessage):
        print(f'[{client.room_id}] {message.uname}: {message.msg}')

        # Treat the incoming message as user input
        async def run_conversation():
            # Run conversation_chain in a separate thread to avoid blocking the event loop
            response = await asyncio.to_thread(self.vtuber_instance.conversation_chain, message.msg)
            print(f"AI Response: {response}")

        asyncio.create_task(run_conversation())

    def _on_gift(self, client: blivedm.BLiveClient, message: web_models.GiftMessage):
        print(f'[{client.room_id}] {message.uname} 赠送 {message.gift_name}x{message.num}')

    def _on_buy_guard(self, client: blivedm.BLiveClient, message: web_models.GuardBuyMessage):
        print(f'[{client.room_id}] {message.username} 购买 {message.gift_name}')

    def _on_super_chat(self, client: blivedm.BLiveClient, message: web_models.SuperChatMessage):
        print(f'[{client.room_id}] 醒目留言 ¥{message.price} {message.uname}: {message.message}')


async def init_session():
    cookies = http.cookies.SimpleCookie()
    cookies['SESSDATA'] = SESSDATA
    cookies['SESSDATA']['domain'] = 'bilibili.com'

    global session
    session = aiohttp.ClientSession()
    session.cookie_jar.update_cookies(cookies)
    return session

async def run_single_client(vtuber_instance: OpenLLMVTuberMain):
    print("run_single_client")
    session = await init_session()
    room_id = TEST_ROOM_IDS
    client = blivedm.BLiveClient(room_id, session=session)
    handler = MyHandler(vtuber_instance)
    client.set_handler(handler)

    client.start()
    try:
        # Keep running indefinitely; press Ctrl+C to exit
        await client.join()
    finally:
        await client.stop_and_close()
        await session.close()


if __name__ == "__main__":

    logger.add(sys.stderr, level="DEBUG")

    config = load_config_with_env("conf.yaml")

    vtuber_main = OpenLLMVTuberMain(config)

    atexit.register(vtuber_main.clean_cache)

    # If you want to allow interrupts from console:
    def _interrupt_on_i():
        while input(">>> say i and press enter to interrupt: ") == "i":
            print("\n\n!!!!!!!!!! interrupt !!!!!!!!!!!!...\n")
            print("Heard sentence: ", vtuber_main.heard_sentence)
            vtuber_main.interrupt(vtuber_main.heard_sentence)

    if config.get("VOICE_INPUT_ON", False):
        threading.Thread(target=_interrupt_on_i).start()

    print("TTS on: ", vtuber_main.config.get("TTS_ON", False))

    # Instead of the while True loop, we run the Bilibili listener:
    # This will trigger `conversation_chain` whenever a new message arrives.
    print("asyncio")
    asyncio.run(run_single_client(vtuber_main))
