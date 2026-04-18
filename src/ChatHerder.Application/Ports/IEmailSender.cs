namespace ChatHerder.Application.Ports;

public interface IEmailSender
{
    /// <summary>Sends a password-reset link containing the raw (unhashed) token.</summary>
    Task SendResetEmailAsync(string toEmail, string rawToken, CancellationToken ct = default);
}
