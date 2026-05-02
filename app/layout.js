export const metadata = {
  title: "LeitorNF — Notas Fiscais de Serviço",
  description: "Extração automática de NFS-e com Google Gemini",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
