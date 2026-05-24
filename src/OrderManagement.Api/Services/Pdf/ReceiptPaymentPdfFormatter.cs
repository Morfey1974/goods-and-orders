using System.Globalization;
using System.Text.Json;
using OrderManagement.Api.Entities;

namespace OrderManagement.Api.Services.Pdf;

public static class ReceiptPaymentPdfFormatter
{
    public static string TypeLabel(ReceiptPaymentType type) => type switch
    {
        ReceiptPaymentType.WithholdingTax => "ניכוי במקור",
        ReceiptPaymentType.BankTransfer => "העברה בנקאית",
        ReceiptPaymentType.Check => "צ'ק",
        ReceiptPaymentType.CreditCard => "כרטיס אשראי",
        ReceiptPaymentType.PaymentApp => "אפליקציית תשלום",
        ReceiptPaymentType.PayPal => "פייפאל",
        ReceiptPaymentType.Cash => "מזומן",
        ReceiptPaymentType.Other => "אחר",
        _ => type.ToString()
    };

    public static string FormatLineDate(DateTime? lineDate)
    {
        if (lineDate is null) return "—";
        return lineDate.Value.ToLocalTime().ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
    }

    public static string FormatDetail(ReceiptPaymentLine line)
    {
        var details = ParseDetails(line.DetailsJson);
        var general = line.GeneralDetail?.Trim();

        return line.PaymentType switch
        {
            ReceiptPaymentType.BankTransfer => JoinParts(
                Part("בנק", details, "bankNumber"),
                Part("סניף", details, "branchNumber"),
                Part("חשבון", details, "accountNumber"),
                Part("אסמ'", details, "reference"),
                general),

            ReceiptPaymentType.WithholdingTax => JoinParts(
                general,
                Value(details, "reference"),
                PercentPart(details)),

            ReceiptPaymentType.Check => JoinParts(
                Part("בנק", details, "bankNumber"),
                Part("סניף", details, "branchNumber"),
                Part("חשבון", details, "accountNumber"),
                Part("מספר צ'ק", details, "checkNumber"),
                general),

            ReceiptPaymentType.CreditCard => JoinCreditCard(details, general),

            ReceiptPaymentType.PaymentApp or ReceiptPaymentType.PayPal or ReceiptPaymentType.Other =>
                JoinParts(
                    Value(details, "appType"),
                    Value(details, "typeName"),
                    Value(details, "transactionNo"),
                    Value(details, "payerAccount"),
                    general),

            _ => string.IsNullOrWhiteSpace(general) ? "—" : general
        };
    }

    private static string JoinCreditCard(Dictionary<string, string> details, string? general)
    {
        var parts = new List<string>();
        var cardType = Value(details, "cardType");
        if (!string.IsNullOrWhiteSpace(cardType))
            parts.Add(cardType);
        var lastFour = Value(details, "lastFour");
        if (!string.IsNullOrWhiteSpace(lastFour))
            parts.Add($"**** {lastFour}");
        if (!string.IsNullOrWhiteSpace(general))
            parts.Add(general);
        return parts.Count == 0 ? "—" : string.Join(" · ", parts);
    }

    private static string? PercentPart(Dictionary<string, string> details)
    {
        var pct = Value(details, "percent");
        return string.IsNullOrWhiteSpace(pct) ? null : $"{pct}%";
    }

    private static string? Part(string label, Dictionary<string, string> details, string key)
    {
        var v = Value(details, key);
        return string.IsNullOrWhiteSpace(v) ? null : $"{label} {v}";
    }

    private static string? Value(Dictionary<string, string> details, string key) =>
        details.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : null;

    private static string JoinParts(params string?[] parts)
    {
        var list = parts.Where(p => !string.IsNullOrWhiteSpace(p)).ToList();
        return list.Count == 0 ? "—" : string.Join(" / ", list);
    }

    private static Dictionary<string, string> ParseDetails(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                var value = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.GetRawText(),
                    JsonValueKind.True => "true",
                    JsonValueKind.False => "false",
                    _ => null
                };
                if (!string.IsNullOrWhiteSpace(value))
                    result[prop.Name] = value;
            }
            return result;
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
