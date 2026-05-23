namespace OrderManagement.Api.Entities;

public enum DocumentType
{
    Quote = 0,
    Order = 1,
    ChargeInvoice = 2,
    Receipt = 3
}

public static class DocumentTypePrefixes
{
    public static string GetPrefix(DocumentType type) => type switch
    {
        DocumentType.Quote => "Q",
        DocumentType.Order => "O",
        DocumentType.ChargeInvoice => "H",
        DocumentType.Receipt => "R",
        _ => "Q"
    };
}
