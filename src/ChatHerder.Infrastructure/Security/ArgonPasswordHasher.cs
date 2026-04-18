using System.Security.Cryptography;
using System.Text;
using ChatHerder.Application.Ports;
using Konscious.Security.Cryptography;

namespace ChatHerder.Infrastructure.Security;

/// <summary>
/// Argon2id-based password hasher implementation used by the authentication layer.
/// </summary>
/// <remarks>
/// Hash format is self-describing as:
/// <c>&lt;base64-salt&gt;.&lt;base64-hash&gt;</c>.
/// 
/// Parameters follow project security guidance:
/// - Memory: 64 MiB
/// - Iterations: 3
/// - Parallelism: 1
/// </remarks>
public sealed class ArgonPasswordHasher : IPasswordHasher
{
    /// <summary>
    /// Argon2 memory cost in KiB (65536 KiB = 64 MiB).
    /// </summary>
    private const int MemorySize = 65536;

    /// <summary>
    /// Argon2 time cost (number of iterations/passes).
    /// </summary>
    private const int Iterations = 3;

    /// <summary>
    /// Argon2 lane count (parallelism).
    /// </summary>
    private const int DegreeOfParallelism = 1;

    /// <summary>
    /// Output hash length in bytes.
    /// </summary>
    private const int HashLength = 32;

    /// <summary>
    /// Creates a salted Argon2id hash for the provided password.
    /// </summary>
    /// <param name="password">Plain-text password to hash.</param>
    /// <returns>
    /// Encoded hash string in the format:
    /// <c>&lt;base64-salt&gt;.&lt;base64-hash&gt;</c>.
    /// </returns>
    public string Hash(string password)
    {
        // Generate a per-password random salt.
        var salt = RandomNumberGenerator.GetBytes(16);

        // Derive Argon2id hash bytes from password + salt.
        var hash = ComputeHash(Encoding.UTF8.GetBytes(password), salt);

        // Self-describing encoded payload.
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    /// <summary>
    /// Verifies whether a plain-text password matches a previously encoded hash.
    /// </summary>
    /// <param name="password">Plain-text password to validate.</param>
    /// <param name="encodedHash">
    /// Stored hash in the format:
    /// <c>&lt;base64-salt&gt;.&lt;base64-hash&gt;</c>.
    /// </param>
    /// <returns>
    /// <see langword="true"/> when the password matches; otherwise <see langword="false"/>.
    /// Returns <see langword="false"/> for malformed input.
    /// </returns>
    public bool Verify(string password, string encodedHash)
    {
        var parts = encodedHash.Split('.');
        if (parts.Length != 2) return false;

        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[0]);
            expected = Convert.FromBase64String(parts[1]);
        }
        catch (FormatException)
        {
            // Invalid base64 payload.
            return false;
        }

        var actual = ComputeHash(Encoding.UTF8.GetBytes(password), salt);

        // Constant-time comparison to mitigate timing attacks.
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    /// <summary>
    /// Computes Argon2id hash bytes for the given password bytes and salt.
    /// </summary>
    /// <param name="passwordBytes">UTF-8 encoded password bytes.</param>
    /// <param name="salt">Per-password random salt bytes.</param>
    /// <returns>Derived hash bytes with length <see cref="HashLength"/>.</returns>
    private static byte[] ComputeHash(byte[] passwordBytes, byte[] salt)
    {
        using var argon2 = new Argon2id(passwordBytes)
        {
            Salt = salt,
            MemorySize = MemorySize,
            Iterations = Iterations,
            DegreeOfParallelism = DegreeOfParallelism,
        };

        return argon2.GetBytes(HashLength);
    }
}