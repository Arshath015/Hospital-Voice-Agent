from typing import Dict, List, Optional
from datetime import datetime

# In-memory database for POC
APPOINTMENTS_DB = []
SLOTS_DB = {
    "2026-03-10": ["10:00 AM", "11:00 AM", "02:00 PM", "04:00 PM"],
    "2026-03-11": ["09:00 AM", "01:00 PM", "03:00 PM"]
}

def check_slot_availability(date: str) -> List[str]:
    """Check available slots for a given date."""
    # Mocking availability
    return SLOTS_DB.get(date, ["09:00 AM", "10:00 AM", "02:00 PM"])

def book_appointment(patient_name: str, phone: str, problem: str, time: str, date: str) -> Dict:
    """Book an appointment and save to memory."""
    appointment = {
        "id": len(APPOINTMENTS_DB) + 1,
        "patient_name": patient_name,
        "phone": phone,
        "problem": problem,
        "time": time,
        "date": date,
        "status": "Confirmed",
        "doctor": "Dr. Smith (General Physician)"
    }
    APPOINTMENTS_DB.append(appointment)
    return appointment

def get_all_appointments() -> List[Dict]:
    """Retrieve all booked appointments."""
    return APPOINTMENTS_DB

def delete_appointment(appointment_id: int) -> bool:
    """Delete an appointment by ID."""
    global APPOINTMENTS_DB
    initial_len = len(APPOINTMENTS_DB)
    APPOINTMENTS_DB = [a for a in APPOINTMENTS_DB if a["id"] != appointment_id]
    return len(APPOINTMENTS_DB) < initial_len
