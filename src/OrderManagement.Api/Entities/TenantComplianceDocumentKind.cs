namespace OrderManagement.Api.Entities;

/// <summary>PDF documents for clients / tax authorities (one file per kind per tenant).</summary>
public enum TenantComplianceDocumentKind
{
    /// <summary>אישור בעלות בחשבון / אישור ניהול חשבון</summary>
    AccountOwnership = 0,

    /// <summary>כרטיס חברה</summary>
    BusinessCard = 1,

    /// <summary>אישור ניהול ספרים</summary>
    BooksManagement = 2,

    /// <summary>אישור ניכוי מס במקור</summary>
    WithholdingTax = 3,
}
