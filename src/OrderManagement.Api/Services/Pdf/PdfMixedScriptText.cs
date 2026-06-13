using System.Globalization;
using System.Text.RegularExpressions;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace OrderManagement.Api.Services.Pdf;

/// <summary>Mixed user text in PDF via QuestPDF/HarfBuzz bidi + Hebrew/Sans font fallback.</summary>
public static class PdfMixedScriptText
{
    private const string BannerSegmentSeparator = " | ";

    private static readonly Regex LatinLetterToken = new(
        @"[A-Za-z][A-Za-z0-9_\-\.]*",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>Keep Latin words / PO codes in reading order inside Hebrew RTL runs (LRM, not LRI).</summary>
    public static string EmbedLatinForRtl(string? text)
    {
        if (string.IsNullOrEmpty(text))
            return text ?? "";

        return LatinLetterToken.Replace(text, static m => $"\u200E{m.Value}\u200E");
    }

    public static void Render(
        IContainer container,
        string? value,
        float fontSize,
        bool alignCenter = false,
        bool bold = false)
    {
        var text = value ?? "";
        var target = alignCenter ? container.AlignCenter() : container.AlignRight();
        if (ShouldUseRtlLayout(text))
            target = target.ContentFromRightToLeft();
        target.Text(text).Style(UserTextStyle(fontSize, bold));
    }

    /// <summary>Dark banner above document line tables — mixed Hebrew + Latin, wraps on long lines.</summary>
    public static void RenderDocumentTableBanner(IContainer container, string? value, float fontSize)
    {
        var style = UserTextStyle(fontSize, bold: true).FontColor(Colors.White);
        if (string.IsNullOrWhiteSpace(value))
        {
            container.AlignRight().Text("").Style(style);
            return;
        }

        var text = value.Contains(BannerSegmentSeparator, StringComparison.Ordinal)
            ? string.Join(BannerSegmentSeparator, value.Split(BannerSegmentSeparator, StringSplitOptions.None)
                .Select(p => p.Trim()))
            : value;

        container
            .AlignRight()
            .ContentFromRightToLeft()
            .Text(EmbedLatinForRtl(text))
            .Style(style);
    }

    /// <summary>Legacy hook for inline <see cref="TextDescriptor"/> callbacks — prefer <see cref="Render"/>.</summary>
    public static void ComposeRuns(TextDescriptor text, string value, float fontSize, bool bold)
    {
        text.Span(value ?? "").Style(UserTextStyle(fontSize, bold));
    }

    public static TextStyle UserTextStyle(float fontSize, bool bold)
    {
        var hebrew = bold ? PdfFontRegistry.HebrewBold : PdfFontRegistry.HebrewRegular;
        var sans = bold ? PdfFontRegistry.SansBold : PdfFontRegistry.SansRegular;
        return TextStyle.Default.FontFamily(hebrew, sans).FontSize(fontSize);
    }

    /// <summary>RTL layout when Hebrew leads or when Hebrew is mixed with Latin/digits (Israeli documents).</summary>
    public static bool ShouldUseRtlLayout(string text)
    {
        if (string.IsNullOrEmpty(text)) return false;
        if (IsRtlDominant(text)) return true;
        return ContainsHebrew(text);
    }

    public static bool ContainsHebrew(string text)
    {
        foreach (var ch in text)
        {
            if (ch is >= '\u0590' and <= '\u05FF')
                return true;
        }

        return false;
    }

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
