using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

public enum PdfScriptKind
{
    Hebrew,
    Sans,
}

/// <summary>Mixed user text: logical-order spans with per-run direction + font (QuestPDF bidi).</summary>
public static class PdfMixedScriptText
{
    public static void Render(
        IContainer container,
        string? value,
        float fontSize,
        bool alignCenter = false,
        bool bold = false)
    {
        var text = value ?? "";
        var target = alignCenter ? container.AlignCenter() : container.AlignRight();
        if (IsRtlDominant(text))
            target = target.ContentFromRightToLeft();
        target.Text(t => ComposeRuns(t, text, fontSize, bold));
    }

    /// <summary>Dark banner above document line tables — explicit RTL run order for Hebrew + Latin.</summary>
    public static void RenderDocumentTableBanner(IContainer container, string? value, float fontSize)
    {
        var text = value ?? "";
        container.ContentFromRightToLeft().Text(t =>
        {
            foreach (var (kind, run) in SplitRuns(text))
            {
                var span = t.Span(run)
                    .FontFamily(FontFamily(kind, bold: true))
                    .FontSize(fontSize)
                    .FontColor(Colors.White)
                    .Bold();

                if (kind == PdfScriptKind.Hebrew)
                    span.DirectionFromRightToLeft();
                else
                    span.DirectionFromLeftToRight();
            }
        });
    }

    public static void ComposeRuns(TextDescriptor text, string value, float fontSize, bool bold)
    {
        foreach (var (kind, run) in SplitRuns(value))
        {
            var span = text.Span(run)
                .FontFamily(FontFamily(kind, bold))
                .FontSize(fontSize);

            if (kind == PdfScriptKind.Hebrew)
                span.DirectionFromRightToLeft();
            else
                span.DirectionFromLeftToRight();
        }
    }

    public static TextStyle UserTextStyle(float fontSize, bool bold)
    {
        var hebrew = bold ? PdfFontRegistry.HebrewBold : PdfFontRegistry.HebrewRegular;
        var sans = bold ? PdfFontRegistry.SansBold : PdfFontRegistry.SansRegular;
        return TextStyle.Default.FontFamily(hebrew, sans).FontSize(fontSize);
    }

    public static IReadOnlyList<(PdfScriptKind Kind, string Text)> SplitRuns(string? text)
    {
        if (string.IsNullOrEmpty(text))
            return [(PdfScriptKind.Sans, "")];

        var runs = new List<(PdfScriptKind, string)>();
        var sb = new System.Text.StringBuilder();
        PdfScriptKind? current = null;

        foreach (var ch in text)
        {
            if (char.IsWhiteSpace(ch))
            {
                sb.Append(ch);
                if (current is null)
                    current = PdfScriptKind.Sans;
                continue;
            }

            var kind = Classify(ch);
            if (current is null)
            {
                current = kind;
                sb.Append(ch);
                continue;
            }

            if (kind == current)
            {
                sb.Append(ch);
            }
            else
            {
                runs.Add((current.Value, sb.ToString()));
                sb.Clear();
                sb.Append(ch);
                current = kind;
            }
        }

        if (sb.Length > 0 && current.HasValue)
            runs.Add((current.Value, sb.ToString()));

        return runs;
    }

    private static PdfScriptKind Classify(char c) =>
        c is (>= '\u0590' and <= '\u05FF') ? PdfScriptKind.Hebrew : PdfScriptKind.Sans;

    public static string FontFamily(PdfScriptKind kind, bool bold) => kind switch
    {
        PdfScriptKind.Hebrew => bold ? PdfFontRegistry.HebrewBold : PdfFontRegistry.HebrewRegular,
        _ => bold ? PdfFontRegistry.SansBold : PdfFontRegistry.SansRegular,
    };

    /// <summary>First strong character, like HTML dir="auto".</summary>
    public static bool IsRtlDominant(string text)
    {
        foreach (var ch in text)
        {
            if (char.IsWhiteSpace(ch) || IsNeutralForDirection(ch))
                continue;

            if (ch is (>= '\u0590' and <= '\u05FF') or (>= '\u0600' and <= '\u06FF'))
                return true;

            if (IsLatinOrCyrillic(ch) || char.IsDigit(ch))
                return false;
        }

        return false;
    }

    private static bool IsLatinOrCyrillic(char c)
    {
        if (c is (>= '\u0590' and <= '\u05FF') or (>= '\u0600' and <= '\u06FF'))
            return false;

        if (c is (>= 'A' and <= 'Z') or (>= 'a' and <= 'z'))
            return true;

        return c is >= '\u0400' and <= '\u052F';
    }

    private static bool IsNeutralForDirection(char c)
    {
        return c switch
        {
            '-' or '–' or '—' or '·' or '/' or '\\' or '(' or ')' or '[' or ']' or '{' or '}' => true,
            _ => char.GetUnicodeCategory(c) is UnicodeCategory.DashPunctuation
                or UnicodeCategory.ConnectorPunctuation
                or UnicodeCategory.OtherPunctuation
                or UnicodeCategory.OpenPunctuation
                or UnicodeCategory.ClosePunctuation
                or UnicodeCategory.InitialQuotePunctuation
                or UnicodeCategory.FinalQuotePunctuation
                or UnicodeCategory.MathSymbol
                or UnicodeCategory.CurrencySymbol
                or UnicodeCategory.OtherSymbol,
        };
    }
}
