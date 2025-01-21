import os
import re
import time
import random
import requests
from tts.tts_interface import TTSInterface

class TTSEngine(TTSInterface):
    def __init__(
        self,
        api_url: str = "http://127.0.0.1:9880/tts",
        text_lang: str = "zh",
        ref_audio_path: str = "人类，我闻到了你身上散发出来的欧气。.wav",
        prompt_lang: str = "zh",
        prompt_text: str = "人类，我闻到了你身上散发出来的欧气。",
        text_split_method: str = "cut5",
        batch_size: str = "1",
        media_type: str = "wav",
        streaming_mode: str = "ture",
        lock_duration: float = 20.0,  # lock chosen variant for 20 seconds
    ):
        self.api_url = api_url
        self.text_lang = text_lang
        self.ref_audio_path = ref_audio_path
        self.prompt_lang = prompt_lang
        self.prompt_text = prompt_text
        self.text_split_method = text_split_method
        self.batch_size = batch_size
        self.media_type = media_type
        self.streaming_mode = streaming_mode
        self.lock_duration = lock_duration

        # Define emotion-based multiple variants:
        self.emotion_variants = {
            "neutral": [
                {"ref_audio_path": "output/hand_opt/11111录zhiTutu.mp3_0011217600_0011307840.wav", "prompt_text": "谢谢三小星宝宝的粉丝灯牌。"},
                {"ref_audio_path": "output/hand_opt/11111录zhiTutu.mp3_0008003840_0008140480.wav", "prompt_text": "这个好可爱，欢迎这个日文老师不认识字。"}
            ],
            "smirk": [
                {"ref_audio_path": "output/hand_opt/11111录zhiTutu.mp3_0011217600_0011307840.wav",
                 "prompt_text": "谢谢三小星宝宝的粉丝灯牌。"},
                 {"ref_audio_path": "output/hand_opt/11111录zhiTutu.mp3_0008003840_0008140480.wav",
                  "prompt_text": "这个好可爱，欢迎这个日文老师不认识字。"}
            ],
            "sadness": [
                {"ref_audio_path": "output/hand_opt/11111录zhiTutu.mp3_0115203840_0115325120.wav", "prompt_text": "妈呀，我今天一看，今天掉十一个船啊，救命啊。"},
                {"ref_audio_path": "output/hand_opt/11111录zhiTutu.mp3_0032643840_0032767040.wav", "prompt_text": "自己什么东西啊什么呀，你们在说什么啊？"},
            ],

            # default emotion fallback
            "default": [
                {"ref_audio_path": self.ref_audio_path, "prompt_text": self.prompt_text}
            ]
        }

        # Track last chosen emotion and variant
        self.last_emotion = None
        self.last_variant = None
        self.last_emotion_chosen_time = 0.0

    def set_emotion(self, emotion: str):
        """
        Update ref_audio_path and prompt_text based on the provided emotion.
        If emotion is default or no previous emotion chosen, or if 20 seconds passed,
        choose a new variant at random.
        If the same emotion is chosen within 20 seconds, use the same variant.
        """
        # If emotion does not exist, fallback to default
        variants = self.emotion_variants.get(emotion, self.emotion_variants["default"])

        current_time = time.time()
        if emotion == "default":
            # Always use default settings without timing logic
            chosen = variants[0]
        else:
            # For non-default emotions, apply the lock logic
            if self.last_emotion == emotion:
                # Same emotion as last time
                if (current_time - self.last_emotion_chosen_time) < self.lock_duration:
                    # Within lock duration, use same variant
                    chosen = self.last_variant
                else:
                    # More than 20 seconds passed, choose a new variant
                    chosen = random.choice(variants)
                    self.last_emotion_chosen_time = current_time
                    self.last_variant = chosen
            else:
                # Different emotion from last time or first time
                chosen = random.choice(variants)
                self.last_emotion_chosen_time = current_time
                self.last_variant = chosen

        # Update last_emotion
        self.last_emotion = emotion

        # Set the chosen variant
        self.ref_audio_path = chosen["ref_audio_path"]
        self.prompt_text = chosen["prompt_text"]

    def generate_audio(self, text, file_name_no_ext=None, emotion=None):
        # If an emotion is provided, update the paths/text
        if emotion:
            self.set_emotion(emotion)
            print("情绪更新："+emotion)


        file_name = self.generate_cache_file_name(file_name_no_ext, self.media_type)
        cleaned_text = re.sub(r'\[.*?\]', '', text)

        data = {
            "text": cleaned_text,
            "text_lang": self.text_lang,
            "ref_audio_path": self.ref_audio_path,
            "prompt_lang": self.prompt_lang,
            "prompt_text": self.prompt_text,
            "text_split_method": self.text_split_method,
            "batch_size": self.batch_size,
            "media_type": self.media_type,
            "streaming_mode": self.streaming_mode,
        }
        print("\n"+data.get("ref_audio_path"))

        # Note: The original code uses GET. If your TTS server expects POST, switch this to requests.post()
        response = requests.get(self.api_url, params=data, timeout=120)

        if response.status_code == 200:
            with open(file_name, "wb") as audio_file:
                audio_file.write(response.content)
            return file_name
        else:
            print(f"Error: Failed to generate audio. Status code: {response.status_code}")
            return None
