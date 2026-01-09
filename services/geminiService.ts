import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Syllabus, LessonContent, WebSource, ExamContent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Robust Markdown Cleaner
const cleanMarkdown = (text: string): string => {
  if (!text) return "";
  let clean = text.trim();
  
  // 1. Remove markdown fences (```markdown, ```)
  // Replaces occurrences at start or end, and even "```markdown" anywhere if model hallucinates.
  clean = clean.replace(/```markdown\s*/gi, "").replace(/```\s*$/g, "").replace(/^```\s*/g, "");

  // 2. Remove common AI chatter prefixes
  const prefixesToRemove = [
    /^Here is the markdown content.*?:/im,
    /^Here's the content.*?:/im,
    /^Sure, here is.*?:/im,
    /^Created content for.*?:/im
  ];
  
  prefixesToRemove.forEach(regex => {
    clean = clean.replace(regex, "");
  });

  // 3. CRITICAL FIX: Un-escape literal newlines (\\n -> \n)
  // Sometimes JSON responses contain double-escaped newlines which breaks Markdown parsing.
  clean = clean.replace(/\\n/g, "\n");

  return clean.trim();
};

// --- 1. Syllabus Generation ---
export const generateSyllabus = async (topic: string): Promise<Syllabus> => {
  const modelId = "gemini-3-flash-preview";
  
  const response = await ai.models.generateContent({
    model: modelId,
    contents: `为主题：“${topic}” 设计一个引人入胜的知识学习路径。
    
    【设计原则】：
    1. **面向精英**：像《哈佛商业评论》或《经济学人》的深度专栏目录一样吸引人。
    2. **结构紧凑**：包含 3 个章节，总共 6-9 个小节 (LESSON)。
    3. **终极挑战**：最后一节必须是 "EXAM"。
    
    语言：简体中文。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                units: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      type: { type: Type.STRING, enum: ["LESSON", "EXAM"] },
                    },
                    required: ["id", "title", "description", "type"],
                  },
                },
              },
              required: ["id", "title", "units"],
            },
          },
        },
        required: ["topic", "chapters"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  const data = JSON.parse(text);
  return {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now(),
      progress: 0
  } as Syllabus;
};

// --- 2. Lesson Content Generation (Optional Flashcards) ---
export const generateLessonContent = async (topic: string, unitTitle: string): Promise<LessonContent> => {
  const modelId = "gemini-3-pro-preview";

  const prompt = `
    Task: Create engaging content for the lesson "${unitTitle}" in the course "${topic}".
    **IMPORTANT: OUTPUT ALL CONTENT IN SIMPLIFIED CHINESE (MANDARIN). Don't include any text in the image.**

    1. **Deep Dive (Article)**: 
       - Pure Markdown format. 
       - Use ## for sections. 
       - Tone: Insightful, conversational, like a Medium article or high-quality newsletter. 
       - **Strictly NO code blocks (\`\`\`) wrapping the output.** Just raw text.
       - Ensure newlines are actual line breaks.
       - Language: Simplified Chinese.
       
    2. **Podcast Script**: 
       - Dialogue between two hosts (Alex and Sam).
       - Natural, flowy, ~8 exchanges.
       - **LANGUAGE: SIMPLIFIED CHINESE (MANDARIN).** This is critical.
       
    3. **Flashcards (Optional)**:
       - IF there are distinct, hard-to-remember concepts, generate 1-3 flashcards.
       - IF the content is purely conceptual or easy, return an empty array.
       - Do NOT force flashcards if not necessary.
       - Language: Simplified Chinese.
       
    4. **Quiz**:
       - One thought-provoking multiple-choice question.
       - Language: Simplified Chinese.
  `;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          summary: { type: Type.STRING, description: "A one-sentence hook for this lesson." },
          deepDive: { type: Type.STRING },
          podcastScript: { 
            type: Type.ARRAY,
            items: { type: Type.STRING } 
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                 front: { type: Type.STRING },
                 back: { type: Type.STRING }
              },
              required: ["front", "back"]
            }
          },
          quiz: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                  },
                },
              },
              correctOptionId: { type: Type.STRING },
              explanation: { type: Type.STRING },
            },
            required: ["question", "options", "correctOptionId", "explanation"],
          },
        },
        required: ["topic", "summary", "deepDive", "podcastScript", "flashcards", "quiz"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  const content = JSON.parse(text) as LessonContent;
  
  // Post-process Markdown
  content.deepDive = cleanMarkdown(content.deepDive);

  // Sources extraction
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const sources: WebSource[] = [];
  if (groundingChunks) {
    groundingChunks.forEach(chunk => {
      if (chunk.web?.uri && chunk.web?.title) {
        sources.push({ uri: chunk.web.uri, title: chunk.web.title });
      }
    });
  }
  const uniqueSources = sources.filter((v,i,a)=>a.findIndex(v2=>(v2.uri===v.uri))===i);

  return { ...content, sources: uniqueSources };
};

// --- 3. Final Exam Generation ---
export const generateFinalExam = async (topic: string): Promise<ExamContent> => {
    const modelId = "gemini-3-pro-preview";
    const response = await ai.models.generateContent({
        model: modelId,
        contents: `为课程 "${topic}" 生成一个结业挑战。
        5-10 道单选题，场景化、深度应用类题目，拒绝死记硬背。
        语言：简体中文。`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                question: { type: Type.STRING },
                                options: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            id: { type: Type.STRING },
                                            text: { type: Type.STRING },
                                        },
                                    },
                                },
                                correctOptionId: { type: Type.STRING },
                                explanation: { type: Type.STRING },
                            },
                            required: ["question", "options", "correctOptionId", "explanation"],
                        }
                    }
                },
                required: ["questions"]
            }
        }
    });

    if (!response.text) throw new Error("No exam generated");
    return JSON.parse(response.text) as ExamContent;
};

// --- Image Generation ---
export const generateLessonImage = async (unitTitle: string, topic: string): Promise<string | undefined> => {
  const modelId = "gemini-2.5-flash-image";
  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { text: `Abstract 3D shape, soft lighting, pastel colors, symbolizing "${unitTitle}" in context of "${topic}". Clean, modern, high quality render, plain background. Don't include any text in the image.` }
        ]
      },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return part.inlineData.data;
    }
  } catch (e) {
    console.warn("Image generation failed", e);
  }
  return undefined;
};

// --- Audio Generation ---
export const generatePodcastAudio = async (lines: string[]): Promise<string> => {
  const modelId = "gemini-2.5-flash-preview-tts";
  
  const multiSpeakerConfig = {
      speakerVoiceConfigs: [
        { speaker: 'A', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        { speaker: 'B', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } }
      ]
  };

  const textPrompt = lines.map((line, idx) => {
      // Just sending text usually works well with multi-speaker config for implicit turn taking
      return line; 
  }).join('\n\n');

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts: [{ text: textPrompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        multiSpeakerVoiceConfig: multiSpeakerConfig
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");
  return base64Audio;
};