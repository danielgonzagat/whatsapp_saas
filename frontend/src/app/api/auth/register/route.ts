import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, workspaceName } = await request.json();

    // Validações básicas
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "A senha deve ter no mínimo 8 caracteres" },
        { status: 400 }
      );
    }

    // Chamar o backend para criar o usuário
    const response = await fetch(`${process.env.BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        name, 
        email, 
        password,
        workspaceName: workspaceName || `${name}'s Workspace`
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { message: error.message || "Erro ao criar conta" },
        { status: response.status }
      );
    }

    const user = await response.json();
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { message: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
