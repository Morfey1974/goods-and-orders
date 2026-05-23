namespace OrderManagement.Api.Entities;

public enum OrderStatus
{
    Draft = 0,
    QuoteSent = 1,
    Accepted = 2,
    InProgress = 3,
    Invoiced = 4,
    AwaitingPayment = 5,
    Paid = 6,
    Completed = 7,
    Cancelled = 8
}
