from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv
from backend.voice.engines import GeminiSTT, GeminiTTS
from backend.agent.workflow import create_agent_graph, AgentState
from backend.tools.appointment_tools import get_all_appointments, delete_appointment

load_dotenv()

app = FastAPI(title="Hospital Voice Agent API")

# Initialize engines
stt_engine = GeminiSTT()
tts_engine = GeminiTTS()
agent_graph = create_agent_graph()

# In-memory conversation state for POC
CONVERSATION_STATE = {
    "patient_name": None,
    "phone_number": None,
    "problem_description": None,
    "preferred_time": None,
    "preferred_date": None,
    "appointment_confirmed": False,
    "doctor_name": None,
    "conversation_history": [],
    "last_response": "",
    "next_node": "greeting"
}

class UserMessage(BaseModel):
    text: str

class AgentResponse(BaseModel):
    response_text: str
    state: Dict
    audio_base64: Optional[str] = None

@app.post("/speech_to_text")
async def speech_to_text(file: UploadFile = File(...)):
    """Convert audio to text."""
    audio_bytes = await file.read()
    text = await stt_engine.transcribe(audio_bytes)
    return {"text": text}

@app.post("/agent_response")
async def agent_response(message: UserMessage):
    """Process user message through LangGraph agent."""
    global CONVERSATION_STATE
    
    # Update state with user message
    CONVERSATION_STATE["conversation_history"].append({"role": "user", "content": message.text})
    
    # Run the graph
    # For POC, we simulate the node execution based on message content
    text = message.text.lower()
    if "meena" in text:
        CONVERSATION_STATE["patient_name"] = "Meena"
    if "fever" in text:
        CONVERSATION_STATE["problem_description"] = "Fever"
    if "2 pm" in text:
        CONVERSATION_STATE["preferred_time"] = "02:00 PM"
        CONVERSATION_STATE["preferred_date"] = "2026-03-10"

    # Execute the graph
    result = agent_graph.invoke(CONVERSATION_STATE)
    CONVERSATION_STATE.update(result)
    
    # Add assistant response to history
    CONVERSATION_STATE["conversation_history"].append({"role": "assistant", "content": CONVERSATION_STATE["last_response"]})
    
    return {
        "response_text": CONVERSATION_STATE["last_response"],
        "state": CONVERSATION_STATE
    }

@app.post("/text_to_speech")
async def text_to_speech(message: UserMessage):
    """Convert text to speech."""
    audio_bytes = await tts_engine.synthesize(message.text)
    # In a real scenario, we'd return the audio file or base64
    return {"audio_bytes": "MOCK_AUDIO_BASE64"}

@app.get("/appointments")
async def list_appointments():
    """List all appointments."""
    return get_all_appointments()

@app.delete("/appointments/{appointment_id}")
async def remove_appointment(appointment_id: int):
    """Delete an appointment."""
    success = delete_appointment(appointment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
