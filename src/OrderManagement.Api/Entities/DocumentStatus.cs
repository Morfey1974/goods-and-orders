namespace OrderManagement.Api.Entities;

/// <summary>UI badges: draft, sent, open, paid, closed.</summary>
public enum DocumentStatus
{
    Draft = 0,
    Sent = 1,
    Open = 2,
    Paid = 3,
    Closed = 4,
    Cancelled = 5
}
