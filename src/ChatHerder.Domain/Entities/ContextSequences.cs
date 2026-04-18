using ChatHerder.Domain.Enums;

namespace ChatHerder.Domain.Entities;

// Composite PK: (ContextType, ContextId).
// NEVER use MAX()+1. Always allocate via:
//   UPDATE "ContextSequences" SET "NextValue" = "NextValue" + 1
//   WHERE "ContextType" = @type AND "ContextId" = @id RETURNING "NextValue";
public sealed class ContextSequences
{
    public required ContextType ContextType { get; init; }
    public required Guid ContextId { get; init; }
    public long NextValue { get; set; } = 1;
}
