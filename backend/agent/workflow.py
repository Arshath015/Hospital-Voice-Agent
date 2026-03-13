from typing import Annotated, List, Dict, Any, TypedDict, Optional, Union
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field
from backend.tools.appointment_tools import check_slot_availability, book_appointment

# Define the structured agent memory state
class AgentState(TypedDict):
    patient_name: Optional[str]
    phone_number: Optional[str]
    problem_description: Optional[str]
    preferred_time: Optional[str]
    preferred_date: Optional[str]
    appointment_confirmed: bool
    doctor_name: Optional[str]
    conversation_history: List[Dict[str, str]]
    last_response: str
    next_node: str

def greeting_node(state: AgentState) -> AgentState:
    """Greets the user and sets initial state."""
    state["last_response"] = "Hello, this is XYZ Hospital. How may I assist you today?"
    state["next_node"] = "intent_detection"
    return state

def intent_detection_node(state: AgentState) -> AgentState:
    """Detects user intent from the last user message."""
    # In a real scenario, we'd use LLM here. For POC, we'll assume intent is booking.
    # We'll update the next node based on missing information.
    if not state["patient_name"]:
        state["next_node"] = "collect_name"
    elif not state["problem_description"]:
        state["next_node"] = "collect_problem"
    elif not state["preferred_time"]:
        state["next_node"] = "collect_time"
    else:
        state["next_node"] = "check_availability"
    return state

def collect_name_node(state: AgentState) -> AgentState:
    """Asks for patient name."""
    state["last_response"] = "Sure, may I know your name please?"
    return state

def collect_problem_node(state: AgentState) -> AgentState:
    """Asks for problem description."""
    state["last_response"] = f"Nice to meet you, {state['patient_name']}. May I know what problem you are experiencing?"
    return state

def collect_time_node(state: AgentState) -> AgentState:
    """Asks for preferred time."""
    state["last_response"] = "When would you like to book the appointment? Please provide a date and time."
    return state

def check_availability_node(state: AgentState) -> AgentState:
    """Checks for slot availability."""
    slots = check_slot_availability(state["preferred_date"] or "2026-03-10")
    if state["preferred_time"] in slots:
        state["next_node"] = "book_appointment"
    else:
        state["last_response"] = f"I'm sorry, {state['preferred_time']} is not available. Available slots are: {', '.join(slots)}."
        state["next_node"] = "collect_time"
    return state

def book_appointment_node(state: AgentState) -> AgentState:
    """Books the appointment."""
    appointment = book_appointment(
        state["patient_name"],
        state["phone_number"] or "N/A",
        state["problem_description"],
        state["preferred_time"],
        state["preferred_date"] or "2026-03-10"
    )
    state["appointment_confirmed"] = True
    state["doctor_name"] = appointment["doctor"]
    state["last_response"] = f"Great! Your appointment is confirmed for {state['preferred_time']} on {state['preferred_date'] or 'today'} with {state['doctor_name']}. Is there anything else?"
    state["next_node"] = "end"
    return state

# Define the Graph
def create_agent_graph():
    workflow = StateGraph(AgentState)
    
    # Add Nodes
    workflow.add_node("greeting", greeting_node)
    workflow.add_node("intent_detection", intent_detection_node)
    workflow.add_node("collect_name", collect_name_node)
    workflow.add_node("collect_problem", collect_problem_node)
    workflow.add_node("collect_time", collect_time_node)
    workflow.add_node("check_availability", check_availability_node)
    workflow.add_node("book_appointment", book_appointment_node)
    
    # Define Edges
    workflow.set_entry_point("greeting")
    workflow.add_edge("greeting", "intent_detection")
    
    # Conditional Edges based on state["next_node"]
    def route_next(state: AgentState):
        return state["next_node"]
    
    workflow.add_conditional_edges(
        "intent_detection",
        route_next,
        {
            "collect_name": "collect_name",
            "collect_problem": "collect_problem",
            "collect_time": "collect_time",
            "check_availability": "check_availability"
        }
    )
    
    workflow.add_edge("collect_name", "intent_detection")
    workflow.add_edge("collect_problem", "intent_detection")
    workflow.add_edge("collect_time", "intent_detection")
    workflow.add_edge("check_availability", "book_appointment")
    workflow.add_edge("book_appointment", END)
    
    return workflow.compile()
