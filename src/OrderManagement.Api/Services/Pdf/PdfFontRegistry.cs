using QuestPDF.Drawing;

namespace OrderManagement.Api.Services.Pdf;

/// <summary>Noto Sans Hebrew (subset) + Noto Sans (Latin/Cyrillic) for mixed user text in PDF.</summary>
public static class PdfFontRegistry
{
    public const string HebrewRegular = "Noto Sans Hebrew";
    public const string HebrewBold = "Noto Sans Hebrew Bold";
    public const string SansRegular = "Noto Sans";
    public const string SansBold = "Noto Sans Bold";

    private static bool _registered;

    public static void EnsureRegistered()
    {
        if (_registered) return;
        Register("NotoSansHebrew-Regular.ttf", HebrewRegular);
        Register("NotoSansHebrew-Bold.ttf", HebrewBold);
        Register("NotoSans-Regular.ttf", SansRegular);
        Register("NotoSans-Bold.ttf", SansBold);
        _registered = true;
    }

    private static void Register(string fileName, string family)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "Fonts", fileName);
        if (!File.Exists(path)) return;
        using var stream = File.OpenRead(path);
        FontManager.RegisterFontWithCustomName(family, stream);
    }
}
