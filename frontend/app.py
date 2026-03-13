import streamlit as st
from streamlit_mic_recorder import mic_recorder
import httpx
import base64
import json
import time

# Configuration
BACKEND_URL = "http://localhost:3000"
ACCENT_COLOR = "#2EF2E2"
BG_COLOR = "#0F2F2F"

# Page config
st.set_page_config(
    page_title="Hospital Voice Agent",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for the AI Dashboard
st.markdown(f"""
    <style>
    .stApp {{
        background-color: {BG_COLOR};
        color: white;
    }}
    .stButton>button {{
        background-color: {ACCENT_COLOR};
        color: {BG_COLOR};
        border-radius: 20px;
        border: none;
        font-weight: bold;
    }}
    .stSidebar {{
        background-color: rgba(46, 242, 226, 0.1);
    }}
    .chat-bubble {{
        padding: 10px;
        border-radius: 15px;
        margin: 5px 0;
        max-width: 80%;
    }}
    .user-bubble {{
        background-color: {ACCENT_COLOR};
        color: {BG_COLOR};
        align-self: flex-end;
    }}
    .agent-bubble {{
        background-color: rgba(255, 255, 255, 0.1);
        color: white;
        align-self: flex-start;
    }}
    .debug-card {{
        background-color: rgba(255, 255, 255, 0.05);
        padding: 15px;
        border-radius: 10px;
        border-left: 4px solid {ACCENT_COLOR};
        margin-bottom: 10px;
    }}
    </style>
""", unsafe_allow_html=True)

# Session State
if "messages" not in st.session_state:
    st.session_state.messages = []
if "agent_state" not in st.session_state:
    st.session_state.agent_state = {}
if "last_stt" not in st.session_state:
    st.session_state.last_stt = ""

# Sidebar Navigation
st.sidebar.title("🏥 XYZ Hospital")
page = st.sidebar.radio("Navigation", ["Voice Agent", "Admin Dashboard"])

if page == "Voice Agent":
    st.title("🎙️ Hospital Voice Agent")
    
    col1, col2 = st.columns([1, 1])
    
    with col1:
        st.subheader("Voice Conversation")
        
        # Audio input
        st.write("Click the microphone to speak:")
        audio = mic_recorder(
            start_prompt="Start Speaking",
            stop_prompt="Stop Speaking",
            key="mic_recorder"
        )
        
        if audio:
            # Process audio
            with st.spinner("Processing voice..."):
                # 1. Speech to Text
                # // Replace Gemini STT with Whisper local model
                # files = {"file": audio["bytes"]}
                # response = httpx.post(f"{BACKEND_URL}/speech_to_text", files=files)
                # stt_text = response.json()["text"]
                
                # For POC, we simulate the STT result
                stt_text = "I want to book an appointment for today at 2 PM. My name is Meena and I have fever."
                st.session_state.last_stt = stt_text
                
                # 2. Agent Response
                # // Replace Gemini LLM with Ollama local model
                payload = {"text": stt_text}
                response = httpx.post(f"{BACKEND_URL}/agent_response", json=payload)
                data = response.json()
                
                # Update session state
                st.session_state.messages.append({"role": "user", "content": stt_text})
                st.session_state.messages.append({"role": "assistant", "content": data["response_text"]})
                st.session_state.agent_state = data["state"]
                
                # 3. Text to Speech
                # // Replace Gemini TTS with Piper TTS local model
                # tts_response = httpx.post(f"{BACKEND_URL}/text_to_speech", json={"text": data["response_text"]})
                # audio_bytes = tts_response.json()["audio_bytes"]
                
                st.success("Response generated!")
                st.audio(b"MOCK_AUDIO_DATA", format="audio/wav") # Mock audio playback
        
        # Conversation Transcript
        st.write("---")
        for msg in st.session_state.messages:
            if msg["role"] == "user":
                st.markdown(f'<div class="chat-bubble user-bubble">👤 {msg["content"]}</div>', unsafe_allow_html=True)
            else:
                st.markdown(f'<div class="chat-bubble agent-bubble">🤖 {msg["content"]}</div>', unsafe_allow_html=True)

    with col2:
        st.subheader("🛠️ Agent Debugging Dashboard")
        
        if st.session_state.agent_state:
            st.markdown('<div class="debug-card">', unsafe_allow_html=True)
            st.write("**Speech To Text Output:**")
            st.info(st.session_state.last_stt)
            
            st.write("**Detected Intent:**")
            st.success("Appointment Booking")
            
            st.write("**LangGraph State:**")
            st.json(st.session_state.agent_state)
            
            st.write("**Tool Calls:**")
            st.code("check_slot_availability('2026-03-10')\nbook_appointment('Meena', 'N/A', 'Fever', '02:00 PM', '2026-03-10')")
            
            st.write("**Agent Reasoning:**")
            st.write("User wants to book an appointment. Missing patient name and problem. Collected 'Meena' and 'Fever'. Checking availability for 2 PM. Slot available. Confirming booking.")
            
            st.write("**Generated Response Text:**")
            st.info(st.session_state.agent_state.get("last_response", ""))
            
            st.write("**Text To Speech Output:**")
            st.write("Audio generated (Mock)")
            st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("Start a conversation to see debug info.")

elif page == "Admin Dashboard":
    st.title("📋 Admin Dashboard")
    st.subheader("Manage Booked Appointments")
    
    # Fetch appointments
    response = httpx.get(f"{BACKEND_URL}/appointments")
    appointments = response.json()
    
    if appointments:
        for appt in appointments:
            with st.expander(f"Appointment #{appt['id']} - {appt['patient_name']}"):
                col1, col2 = st.columns([3, 1])
                with col1:
                    st.write(f"**Phone:** {appt['phone']}")
                    st.write(f"**Problem:** {appt['problem']}")
                    st.write(f"**Time:** {appt['time']} on {appt['date']}")
                    st.write(f"**Doctor:** {appt['doctor']}")
                with col2:
                    if st.button(f"Delete #{appt['id']}", key=f"del_{appt['id']}"):
                        httpx.delete(f"{BACKEND_URL}/appointments/{appt['id']}")
                        st.rerun()
    else:
        st.info("No appointments booked yet.")
