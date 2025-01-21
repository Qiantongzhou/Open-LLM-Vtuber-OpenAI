import requests
import json as JSON

def send_message_to_broadcast(message):
    url = "http://127.0.0.1:8000/broadcast"

    payload = {"type" : "full-text", "text": message}


    data = {"message": JSON.dumps(payload)}
    response = requests.post(url, json=data)
    print(f"Response Status Code: {response.status_code}")
    if response.ok:
        print("Message successfully sent to the broadcast route.")
    else:
        print("Failed to send message to the broadcast route.")



import re
import json

class YourClass:
    def __init__(self, path_to_songs: str, verbose: bool = False):
        self.verbose = verbose
        self.path_to_songs = path_to_songs

        # Load all .wav files from directory
        import os
        self.all_songs = []
        for file in os.listdir(self.path_to_songs):
            if file.endswith(".wav"):
                file_name_no_ext = os.path.splitext(file)[0]
                self.all_songs.append(file_name_no_ext)

        if not self.all_songs:
            raise ValueError(f"No .wav files found in {self.path_to_songs}")

        self.remaining_songs = []

    def _get_song_audio_file_path(self, file_name_no_ext: str | None) -> str:
        import os
        if file_name_no_ext is not None:
            if file_name_no_ext in self.all_songs:
                return os.path.join(self.path_to_songs, f"{file_name_no_ext}.wav")
            else:
                if self.verbose:
                    print(f"Requested song '{file_name_no_ext}' not found. Falling back to random.")
                file_name_no_ext = None

        if file_name_no_ext is None:
            import random
            if not self.remaining_songs:
                self.remaining_songs = self.all_songs[:]
                random.shuffle(self.remaining_songs)
                if self.verbose:
                    print("Resetting remaining_songs pool and shuffling.")

            selected_song = self.remaining_songs.pop()
            if self.verbose:
                print(f"Randomly selected song: {selected_song}")
            return os.path.join(self.path_to_songs, f"{selected_song}.wav")

    def _generate_audio_file(self, sentence: str, file_name_no_ext: str, emotion=None) -> str | None:
        if self.verbose:
            print(f">> generating {file_name_no_ext}...")


        sentence = sentence.strip()
        if sentence == "":
            return None

        # Attempt to find a JSON substring of the form {"action": "something"}
        json_pattern = r'(\{.*?\})'
        match = re.search(json_pattern, sentence)
        action = None
        if match:
            json_str = match.group(1)
            print("ss1")
            try:
                data = json.loads(json_str)
                action = data.get("action", None)
            except json.JSONDecodeError:
                pass

        if action == "play_song":
            # Remove the JSON part from the sentence to "clean it up"
            # For example, just strip out the matched JSON substring
            cleaned_sentence = sentence.replace(match.group(1), "").strip()

            # You might do something with cleaned_sentence if needed,
            # e.g. read it out first, or ignore it.
            # For now, we assume we just go to play a random song.

            song_file_path = self._get_song_audio_file_path(None)
            if self.verbose:
                print(f"Action detected: play_song. Returning song file {song_file_path}")
            return song_file_path
        print("ss")
        # If no action or not play_song, use TTS as normal
        return self.tts.generate_audio(sentence, file_name_no_ext=file_name_no_ext, emotion=emotion)
audio_manager = YourClass(path_to_songs="C:/Users/26565/PycharmProjects/Open-LLM-VTuber-BL/tuzisong", verbose=True)

# Example input with action
input_sentence = '{"action": "play_song"}'
file_name_no_ext = "example_audio_output"
audio_path = audio_manager._generate_audio_file(input_sentence, file_name_no_ext)
print(f"Audio file: {audio_path}")