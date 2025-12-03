import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { message: "Número de telefone é obrigatório" },
        { status: 400 }
      );
    }

    // Normalizar número de telefone (remover espaços e caracteres especiais)
    const normalizedPhone = phone.replace(/\D/g, "");

    // Gerar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Salvar código no backend/redis para verificação posterior
    const saveResponse = await fetch(`${process.env.BACKEND_URL}/auth/whatsapp/save-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizedPhone, code }),
    });

    if (!saveResponse.ok) {
      throw new Error("Erro ao salvar código");
    }

    // Enviar código via Evolution API (ou similar)
    const evolutionResponse = await fetch(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EVOLUTION_API_KEY || "",
        },
        body: JSON.stringify({
          number: normalizedPhone,
          text: `🔐 Seu código de verificação KLOEL é: *${code}*\n\nNão compartilhe este código com ninguém.`,
        }),
      }
    );

    if (!evolutionResponse.ok) {
      // Fallback: tentar outro método de envio ou retornar erro
      console.error("Evolution API error:", await evolutionResponse.text());
      return NextResponse.json(
        { message: "Erro ao enviar código via WhatsApp" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Código enviado com sucesso" },
      { status: 200 }
    );
  } catch (error) {
    console.error("WhatsApp send code error:", error);
    return NextResponse.json(
      { message: "Erro ao enviar código" },
      { status: 500 }
    );
  }
}
