using Microsoft.AspNetCore.Mvc;
using OrderManagement.Api.Dto;
using OrderManagement.Api.Services;

namespace OrderManagement.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    AuthService authService,
    PasswordResetService passwordResetService) : ControllerBase
{
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        var result = await authService.RegisterAsync(request, ct);
        if (result is null)
            return Conflict(new { message = "Email already registered." });

        return Ok(result);
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await authService.LoginAsync(request, ct);
        if (result is null)
            return Unauthorized(new { message = "Invalid email or password." });

        return Ok(result);
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request,
        CancellationToken ct)
    {
        await passwordResetService.RequestResetAsync(request.Email, ct);
        // Always 204 — do not reveal whether the email exists.
        return NoContent();
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request,
        CancellationToken ct)
    {
        var ok = await passwordResetService.ConfirmResetAsync(request.Token, request.NewPassword, ct);
        if (!ok)
            return BadRequest(new { code = "invalid_or_expired_token", message = "Reset link is invalid or expired." });

        return NoContent();
    }
}
