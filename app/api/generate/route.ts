import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const prompt = formData.get('prompt') as string;
    const image = formData.get('image') as File;

    if (!image || !prompt) {
      return NextResponse.json({ error: 'Missing prompt or image' }, { status: 400 });
    }

    // Convert file to base64 for Gemini
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64Image = buffer.toString('base64');

    // const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    // const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

    // Strict prompt to ensure valid JSON output
    const fullPrompt = `
      ${prompt}
      Generate a list of precise multiple-choice questions based on this image.
      You MUST respond ONLY with a raw JSON array of objects. Do not use markdown blocks.
      Format: [{"question_text": "...", "options": ["A", "B", "C", "D"], "correct_answer": "A"}]
    `;

    const result = await model.generateContent([
      fullPrompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: image.type,
        },
      },
    ]);

    const responseText = result.response.text();
    
    // Strip markdown formatting if Gemini includes it
    const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const questions = JSON.parse(cleanedJson);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}