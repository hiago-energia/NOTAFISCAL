export async function POST(request) {
  try {
    const { fileData, mimeType, apiKey } = await request.json();

    if (!apiKey) {
      return Response.json({ error: "Chave API não informada." }, { status: 400 });
    }

    const prompt = `Você é especialista em Notas Fiscais de Serviço brasileiras (NFS-e).
Analise este documento e extraia os dados. Retorne SOMENTE JSON válido, sem markdown, sem texto extra.

{"numero_nf":"","competencia":"","data_emissao":"","prestador":"","cnpj_cpf":"","tomador":"","descricao_servico":"","valor":"","iss_percentual":"","banco":"","agencia":"","conta":"","favorecido":""}

Regras:
- competencia: mês/ano ex: 03/2025
- data_emissao: dd/mm/aaaa
- valor: só números e vírgula ex: 1.500,00
- iss_percentual: só número ex: 5
- Campos ausentes: ""
- Retorne SOMENTE o JSON`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: fileData } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return Response.json(
        { error: data.error?.message || `Erro Gemini HTTP ${geminiRes.status}` },
        { status: geminiRes.status }
      );
    }

    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "")
      .replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ error: "Gemini não retornou JSON válido.", raw: text }, { status: 500 });
    }

    return Response.json({ result: parsed });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
