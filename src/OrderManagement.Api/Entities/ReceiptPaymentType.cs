namespace OrderManagement.Api.Entities;

public enum ReceiptPaymentType
{
    WithholdingTax = 0,
    BankTransfer = 1,
    Check = 2,
    CreditCard = 3,
    PaymentApp = 4,
    PayPal = 5,
    Cash = 6,
    Other = 7
}
