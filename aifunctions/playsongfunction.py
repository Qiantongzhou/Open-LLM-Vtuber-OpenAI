import os
import random


class playsongfunction:
    def __init__(self, verbose: bool = False):
        # Initialize your song list here.
        # You can store just file name bases, or full paths.

        self.all_songs = []
        self.path_to_songs = "C:/Users/26565/PycharmProjects/Open-LLM-VTuber-BL/tuzisong"
        for file in os.listdir(self.path_to_songs):
            if file.endswith(".wav"):  # Change extension if needed
                file_name_no_ext = file
                self.all_songs.append(file_name_no_ext)

            if file.endswith(".mp3"):  # Change extension if needed
                file_name_no_ext = file
                self.all_songs.append(file_name_no_ext)

        if not self.all_songs:
            raise ValueError(f"No .wav files found in {self.path_to_songs}")
        print(f"debug SongList size: {len(self.all_songs)}")
        self.remaining_songs = []
        self.verbose = verbose

    def _get_song_audio_file_path(self, file_name_no_ext: str | None) -> str:
        # Check if a specific song name is provided
        if file_name_no_ext and file_name_no_ext in self.all_songs:
            # If the song is in remaining_songs, remove it
            if file_name_no_ext in self.remaining_songs:
                self.remaining_songs.remove(file_name_no_ext)
            if self.verbose:
                print(f"Returning requested song: {file_name_no_ext}")
            return f"{self.path_to_songs}/{file_name_no_ext}"

        # If file_name_no_ext is None or not found, pick a random song that hasn't been used yet
        if not self.remaining_songs:
            self.remaining_songs = self.all_songs[:]
            random.shuffle(self.remaining_songs)
            if self.verbose:
                print("Resetting remaining_songs pool and shuffling.")

        selected_song = self.remaining_songs.pop()  # remove one from the end
        if self.verbose:
            print(f"Randomly selected song: {selected_song}")
        return f"{self.path_to_songs}/{selected_song}"