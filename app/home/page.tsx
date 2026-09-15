'use client';

import { useState } from 'react';
// Import your provided browser client utility (adjust path if needed)
import { createClient } from '@/utils/supabase/client';

type Option = { key: string; text: string };
type Question = {
  text: string;
  options: Option[];
  correctOptionKey: string;
  explanation?: string;
  difficulty?: string;
};

export default function QuizBuilder() {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<File | null>(null);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [stagedQuestions, setStagedQuestions] = useState<Question[]>([]);
  const [finalQuestions, setFinalQuestions] = useState<Question[]>([]);

  // Send image + prompt to Gemini API
  const handleGenerate = async () => {
    if (!image || !prompt) return alert('Provide an image and a prompt.');
    setIsGenerating(true);
    
    const formData = new FormData();
    formData.append('image', image);
    formData.append('prompt', prompt);

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();
      
      if (data.questions) {
        setStagedQuestions(data.questions);
      } else {
        alert('Could not parse questions from AI.');
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed. Check console.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Move a question from Staged to Final
  const keepQuestion = (q: Question, index: number) => {
    setFinalQuestions([...finalQuestions, q]);
    removeStagedQuestion(index);
  };

  const removeStagedQuestion = (index: number) => {
    setStagedQuestions(stagedQuestions.filter((_, i) => i !== index));
  };

  const removeFinalQuestion = (index: number) => {
    setFinalQuestions(finalQuestions.filter((_, i) => i !== index));
  };

  // Save to Supabase using your SSR browser client
  const handleSaveQuiz = async () => {
    if (!title) return alert('Enter a quiz title');
    if (finalQuestions.length === 0) return alert('No questions selected');
    
    setIsSaving(true);
    try {
      // Create the browser client lazily (only when saving), so the module
      // never instantiates it during render/prerender.
      const supabase = createClient();

      // 1. Insert Quiz
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .insert([{ title }])
        .select()
        .single();

      if (quizError) throw quizError;

      // 2. Insert Questions
      const questionsToInsert = finalQuestions.map((q, i) => ({
        quiz_id: quizData.id,
        question_text: q.text,
        options: q.options, // jsonb: [{ key, text }]
        correct_answer: q.correctOptionKey,
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? null,
        order: i,
      }));

      const { error: qError } = await supabase
        .from('questions')
        .insert(questionsToInsert);
        
      if (qError) throw qError;

      alert('Quiz Saved Successfully!');
      
      // Reset UI
      setTitle('');
      setFinalQuestions([]);
      setStagedQuestions([]);
      setImage(null);
      setPrompt('');
      
    } catch (error) {
      console.error('Supabase save error:', error);
      alert('Failed to save quiz to database.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 font-sans">
      <h1 className="text-2xl font-bold mb-6">Create AI Quiz</h1>

      {/* Quiz Details */}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-1">Quiz Title</label>
        <input 
          type="text" 
          value={title} 
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g., Chapter 1: Biology" 
          className="w-full p-2 border rounded"
        />
      </div>

      {/* Generator Form */}
      <div className="bg-gray-50 p-4 border rounded-lg mb-6">
        <input 
          type="file" 
          accept="image/*" 
          onChange={e => setImage(e.target.files?.[0] || null)}
          className="block w-full mb-4 text-sm"
        />
        <textarea 
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g., Create 5 multiple choice questions about the subjects in this image..."
          className="w-full p-2 border rounded h-24 mb-4 text-sm"
        />
        <button 
          onClick={handleGenerate} 
          disabled={isGenerating}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : 'Generate Questions'}
        </button>
      </div>

      {/* Verification Area (Staged Questions) */}
      {stagedQuestions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3 border-b pb-2">Verify Generated Questions</h2>
          <div className="space-y-4">
            {stagedQuestions.map((q, i) => (
              <div key={i} className="border p-4 rounded bg-white shadow-sm">
                <p className="font-semibold mb-2">{q.text}</p>
                <div className="space-y-1 mb-3">
                  {q.options.map((opt, j) => (
                    <div key={j} className="text-sm border p-1 rounded bg-gray-50">
                      <span className="font-medium mr-1">{opt.key}.</span>{opt.text}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-green-700 font-medium mb-3">Answer: {q.correctOptionKey}</p>
                <div className="flex gap-2">
                  <button onClick={() => keepQuestion(q, i)} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Keep</button>
                  <button onClick={() => removeStagedQuestion(i)} className="bg-red-500 text-white px-3 py-1 rounded text-sm">Discard</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final List Area */}
      <div>
        <h2 className="text-lg font-bold mb-3 border-b pb-2">Final Quiz ({finalQuestions.length} Questions)</h2>
        {finalQuestions.length === 0 ? (
          <p className="text-sm text-gray-500">No questions added yet.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {finalQuestions.map((q, i) => (
              <div key={i} className="border p-3 rounded flex justify-between items-start bg-gray-50">
                <p className="text-sm font-medium">{i + 1}. {q.text}</p>
                <button onClick={() => removeFinalQuestion(i)} className="text-red-500 text-xs font-bold ml-4 hover:underline">Remove</button>
              </div>
            ))}
          </div>
        )}

        <button 
          onClick={handleSaveQuiz} 
          disabled={isSaving || finalQuestions.length === 0}
          className="w-full bg-black text-white px-4 py-3 rounded font-bold disabled:opacity-50 mt-4"
        >
          {isSaving ? 'Saving...' : 'Save Quiz to Database'}
        </button>
      </div>
    </div>
  );
}