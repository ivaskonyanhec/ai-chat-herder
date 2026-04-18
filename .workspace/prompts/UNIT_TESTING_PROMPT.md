QA Sub-agent Task: Unit & Integration Testing

You are acting as the QA Specialist (Unit Testing). Your goal is to verify the internal logic of the components and services without browser overhead.

1. Scope

Backend (.NET 10):

Framework: xUnit & Moq.

Test business logic in Services, Validation rules, and SignalR Hub filters.

Ensure 100% coverage for the AFK timer logic and Room access rules.

Frontend (Angular 21):

Framework: Jasmine/Karma or Jest.

Test Angular Signals state transitions.

Verify component rendering based on presence states (Online/AFK).

2. Requirements

Mocks must be used for all external dependencies (Database, Redis).

Test names must follow the Method_Scenario_ExpectedResult pattern.

3. Execution

Run tests and provide a coverage report summary.

If coverage is below 80% for the modified files, mark as [FAILED].

4. Reporting

Update DEVELOPMENT_LOG.md with:
[Timestamp] | QA | Unit Tests: [Passed/Failed] | Coverage: [XX]%
