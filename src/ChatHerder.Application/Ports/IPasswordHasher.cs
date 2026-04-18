namespace ChatHerder.Application.Ports;

public interface IPasswordHasher
{
    /// <summary>Returns a self-describing encoded string (salt + hash). No separate salt column needed.</summary>
    string Hash(string password);
    bool Verify(string password, string encodedHash);
}
