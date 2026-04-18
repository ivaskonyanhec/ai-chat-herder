using System.Security.Cryptography;
using System.Text;
using ChatHerder.Application.Ports;
using Konscious.Security.Cryptography;

namespace ChatHerder.Infrastructure.Security;

public sealed class ArgonPasswordHasher : IPasswordHasher
{
    // AGENT.md §3.1: 64 MiB memory, 3 iterations, parallelism 1
    private const int MemorySize          = 65536; // KiB = 64 MiB
    private const int Iterations          = 3;
    private const int DegreeOfParallelism = 1;
    private const int HashLength          = 32;    // bytes

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = ComputeHash(Encoding.UTF8.GetBytes(password), salt);
        // self-describing: "<base64-salt>.<base64-hash>"
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool Verify(string password, string encodedHash)
    {
        var parts = encodedHash.Split('.');
        if (parts.Length != 2) return false;

        byte[] salt, expected;
        try
        {
            salt     = Convert.FromBase64String(parts[0]);
            expected = Convert.FromBase64String(parts[1]);
        }
        catch (FormatException) { return false; }

        var actual = ComputeHash(Encoding.UTF8.GetBytes(password), salt);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    private static byte[] ComputeHash(byte[] passwordBytes, byte[] salt)
    {
        using var argon2 = new Argon2id(passwordBytes)
        {
            Salt                = salt,
            MemorySize          = MemorySize,
            Iterations          = Iterations,
            DegreeOfParallelism = DegreeOfParallelism,
        };
        return argon2.GetBytes(HashLength);
    }
}
