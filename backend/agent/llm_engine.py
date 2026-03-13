from abc import ABC, abstractmethod
from typing import List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
import os

class LLMEngine(ABC):
    @abstractmethod
    async def generate_response(self, messages: List[Dict[str, str]]) -> str:
        pass

class GeminiLLM(LLMEngine):
    """
    Placeholder for Gemini LLM.
    Replace with local Ollama + Phi3 or Llama3 for offline use.
    """
    def __init__(self, api_key: str):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=api_key,
            temperature=0.7
        )

    async def generate_response(self, messages: List[Dict[str, str]]) -> str:
        # // Replace Gemini LLM with Ollama local model
        # from langchain_community.llms import Ollama
        # llm = Ollama(model="llama3")
        # response = llm.invoke(prompt)
        # return response
        
        # Convert messages to LangChain format
        formatted_messages = []
        for msg in messages:
            if msg["role"] == "user":
                formatted_messages.append(("user", msg["content"]))
            elif msg["role"] == "assistant":
                formatted_messages.append(("assistant", msg["content"]))
            elif msg["role"] == "system":
                formatted_messages.append(("system", msg["content"]))
        
        response = await self.llm.ainvoke(formatted_messages)
        return response.content
