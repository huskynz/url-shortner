using QRCoder;

namespace UrlShortener.Shared.Services;

/// <summary>Local, high-contrast PNG with the default four-module quiet zone.</summary>
public static class PublicQr
{
    public static byte[] Png(string publicBase, string path)
    {
        ApiV1Links.Require(PublicLink.ValidBase(publicBase) && InputValidation.Path(path),
            400, "invalid_public_url", "Configure a valid canonical Public URL and short path.");
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(PublicLink.Build(publicBase, path), QRCodeGenerator.ECCLevel.Q);
        using var png = new PngByteQRCode(data);
        return png.GetGraphic(8);
    }
}
