# Hospital Voice Agent POC

A modular Proof of Concept (POC) for a voice-to-voice AI agent for hospital appointment booking.

## Architecture Overview

The system follows an **Agentic AI architecture** with clear abstraction layers for Speech-To-Text (STT), LLM reasoning, and Text-To-Speech (TTS).

### Running Demo
For the best preview experience in AI Studio, the core agent logic and UI have been integrated into **`src/App.tsx`** using React and Tailwind CSS. This allows you to interact with the POC immediately.

### Modular Abstraction Layers
The project is structured to be easily switchable to local open-source models:

1.  **Speech To Text (STT)**: Abstracted in the UI. Can be replaced with **Whisper**.
2.  **LLM Reasoning**: Implemented as a state machine. Can be replaced with **Ollama + Llama3**.
3.  **Text To Speech (TTS)**: Abstracted in the UI. Can be replaced with **Piper TTS**.

## Project Structure (Full-Stack Reference)
While the running demo is in React, the following structure is provided as a reference for a production-grade full-stack deployment:

- `backend/`: FastAPI application and agent logic.
  - `agent/`: LangGraph workflow and LLM engine.
  - `tools/`: Appointment booking tools and in-memory DB.
  - `voice/`: STT and TTS abstraction layers.
- `frontend/`: Streamlit dashboard reference (in `frontend/app.py`).

## How to Interact
1.  **Voice Agent Tab**: Click the microphone to simulate voice input.
2.  **Debug Dashboard**: Watch the agent's reasoning, state updates, and tool calls in real-time.
3.  **Admin Panel**: View and delete booked appointments.

## UI Design
- **Primary Accent**: `#2EF2E2`
- **Background**: `#0F2F2F`
- **Style**: Modern AI dashboard with rounded components and dark theme.
