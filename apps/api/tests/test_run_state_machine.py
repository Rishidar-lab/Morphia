"""Run state machine transition validation tests."""

from app.models.runs import (
    APPROVAL_STATES,
    CANCELLABLE_STATES,
    LEGAL_TRANSITIONS,
    TERMINAL_STATES,
    RunState,
    validate_transition,
)


class TestLegalTransitions:
    """Test that the state machine enforces legal transitions."""

    def test_draft_to_planning_is_valid(self):
        assert validate_transition(RunState.DRAFT, RunState.PLANNING)

    def test_draft_to_running_is_invalid(self):
        assert not validate_transition(RunState.DRAFT, RunState.RUNNING)

    def test_planning_to_awaiting_plan_approval(self):
        assert validate_transition(RunState.PLANNING, RunState.AWAITING_PLAN_APPROVAL)

    def test_running_to_completed(self):
        assert validate_transition(RunState.RUNNING, RunState.COMPLETED)

    def test_running_to_awaiting_action_approval(self):
        assert validate_transition(RunState.RUNNING, RunState.AWAITING_ACTION_APPROVAL)

    def test_awaiting_action_approval_back_to_running(self):
        assert validate_transition(RunState.AWAITING_ACTION_APPROVAL, RunState.RUNNING)

    def test_completed_to_anything_is_invalid(self):
        for target in RunState:
            assert not validate_transition(RunState.COMPLETED, target)

    def test_cancelled_to_anything_is_invalid(self):
        for target in RunState:
            assert not validate_transition(RunState.CANCELLED, target)

    def test_failed_can_retry_to_draft(self):
        assert validate_transition(RunState.FAILED, RunState.DRAFT)

    def test_failed_to_running_is_invalid(self):
        assert not validate_transition(RunState.FAILED, RunState.RUNNING)


class TestCancellableStates:
    """Test cancellation is valid from appropriate states."""

    def test_all_active_states_are_cancellable(self):
        for state in CANCELLABLE_STATES:
            assert validate_transition(state, RunState.CANCELLED), f"{state} should be cancellable"

    def test_terminal_states_not_cancellable(self):
        for state in TERMINAL_STATES:
            assert not validate_transition(state, RunState.CANCELLED)


class TestApprovalStates:
    """Test that approval states are correctly identified."""

    def test_awaiting_plan_approval_is_approval_state(self):
        assert RunState.AWAITING_PLAN_APPROVAL in APPROVAL_STATES

    def test_awaiting_action_approval_is_approval_state(self):
        assert RunState.AWAITING_ACTION_APPROVAL in APPROVAL_STATES

    def test_running_is_not_approval_state(self):
        assert RunState.RUNNING not in APPROVAL_STATES


class TestTerminalStates:
    """Test terminal states have no outgoing transitions (except FAILED->DRAFT)."""

    def test_completed_is_terminal(self):
        assert RunState.COMPLETED in TERMINAL_STATES
        assert len(LEGAL_TRANSITIONS[RunState.COMPLETED]) == 0

    def test_cancelled_is_terminal(self):
        assert RunState.CANCELLED in TERMINAL_STATES
        assert len(LEGAL_TRANSITIONS[RunState.CANCELLED]) == 0

    def test_failed_allows_retry(self):
        assert RunState.FAILED in TERMINAL_STATES
        assert LEGAL_TRANSITIONS[RunState.FAILED] == {RunState.DRAFT}


class TestIdempotency:
    """Test that self-transitions are rejected (no state to same state)."""

    def test_no_self_transitions(self):
        for state in RunState:
            assert not validate_transition(state, state), f"{state} should not self-transition"
