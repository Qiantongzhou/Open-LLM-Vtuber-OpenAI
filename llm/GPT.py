""" Description: This file contains the implementation of the `ollama` class.
This class is responsible for handling the interaction with the OpenAI API for
language generation.
And it is compatible with all of the OpenAI Compatible endpoints, including Ollama,
OpenAI, and more.
"""

from typing import Iterator
import json
from openai import OpenAI

from .llm_interface import LLMInterface


class LLM(LLMInterface):
# class LLM:
    def __init__(
        self,
        model: str,
        system: str,
        callback=print,
        llm_api_key: str = "z",
        verbose: bool = False,
    ):
        """
        Initializes an instance of the `ollama` class.

        Parameters:
        - base_url (str): The base URL for the OpenAI API.
        - model (str): The model to be used for language generation.
        - system (str): The system to be used for language generation.
        - callback [DEPRECATED] (function, optional): The callback function to be called after each API call. Defaults to `print`.
        - organization_id (str, optional): The organization ID for the OpenAI API. Defaults to an empty string.
        - project_id (str, optional): The project ID for the OpenAI API. Defaults to an empty string.
        - llm_api_key (str, optional): The API key for the OpenAI API. Defaults to an empty string.
        - verbose (bool, optional): Whether to enable verbose mode. Defaults to `False`.
        """

        self.model = model
        self.system = system
        self.callback = callback
        self.memory = []
        self.verbose = verbose
        self.client = OpenAI(

            api_key=llm_api_key,
        )

        self.__set_system(system)

        if self.verbose:
            self.__printDebugInfo()

    def __set_system(self, system):
        """
        Set the system prompt
        system: str
            the system prompt
        """
        self.system = system
        self.memory.append(
            {
                "role": "system",
                "content": system,
            }
        )

    def __print_memory(self):
        """
        Print the memory
        """
        print("Memory:\n========\n")
        # for message in self.memory:
        print(self.memory)
        print("\n========\n")

    def __printDebugInfo(self):
        #print(" -- Base URL: " + self.base_url)
        print(" -- Model: " + self.model)
        print(" -- System: " + self.system)

    def chat_iter(self, prompt: str) -> Iterator[str]:

        self.memory.append(
            {
                "role": "user",
                "content": prompt,
            }
        )

        if self.verbose:
            self.__print_memory()
            #print(" -- Base URL: " + self.base_url)
            print(" -- Model: " + self.model)
            print(" -- System: " + self.system)
            print(" -- Prompt: " + prompt + "\n\n")

        chat_completion = []
        try:
            chat_completion = self.client.chat.completions.create(
                messages=self.memory,
                model=self.model,
                stream=True,
            )
        except Exception as e:
            print("Error calling the chat endpoint: " + str(e))
            self.__printDebugInfo()
            return "Error calling the chat endpoint: " + str(e)

        # a generator to give back an iterator to the response that will store
        # the complete response in memory once the iteration is done
        def _generate_and_store_response():
            complete_response = ""
            for chunk in chat_completion:
                if chunk.choices[0].delta.content is None:
                    chunk.choices[0].delta.content = ""
                yield chunk.choices[0].delta.content
                complete_response += chunk.choices[0].delta.content

            self.memory.append(
                {
                    "role": "assistant",
                    "content": complete_response,
                }
            )

            def serialize_memory(memory, filename):
                with open(filename, "w") as file:
                    json.dump(memory, file)

            serialize_memory(self.memory, "mem.json")
            return

        return _generate_and_store_response()

    def handle_interrupt(self, heard_response: str) -> None:
        if self.memory[-1]["role"] == "assistant":
            self.memory[-1]["content"] = heard_response + "..."
        else:
            if heard_response:
                self.memory.append(
                    {
                        "role": "assistant",
                        "content": heard_response + "...",
                    }
                )
        self.memory.append(
            {
                "role": "system",
                "content": "[Interrupted by user]",
            }
        )


def test():
    llm = LLM(
        model="gpt-4o-mini",
        callback=print,
        system='You are a sarcastic AI chatbot who loves to the jokes "Get out and touch some grass"',

        llm_api_key="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",
        verbose=True,
    )
    while True:
        print("\n>> (Press Ctrl+C to exit.)")
        chat_complet = llm.chat_iter(input(">> "))

        for chunk in chat_complet:
            if chunk:
                print(chunk, end="")


if __name__ == "__main__":
    test()
