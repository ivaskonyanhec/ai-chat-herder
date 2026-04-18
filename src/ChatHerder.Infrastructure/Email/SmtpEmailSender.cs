using ChatHerder.Application.Ports;
using Microsoft.Extensions.Logging;

namespace ChatHerder.Infrastructure.Email;

// Full SMTP implementation deferred to Phase 4.
// Dev stub logs the reset token so the flow is testable end-to-end without an SMTP server.
public sealed class SmtpEmailSender(ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public Task SendResetEmailAsync(string toEmail, string rawToken, CancellationToken ct = default)
    {
        logger.LogWarning(
            "[DEV] Password reset token for {Email}: {Token} — wire real SMTP in Phase 4",
            toEmail, rawToken);
        return Task.CompletedTask;
    }
}
