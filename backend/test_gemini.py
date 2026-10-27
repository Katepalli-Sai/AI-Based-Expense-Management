import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

if not api_key:
    print("ERROR: GEMINI_API_KEY is missing from .env")
else:
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents="Reply with exactly: Gemini connection successful"
        )
        print("SUCCESS:", response.text)
    except Exception as error:
        print("FAILED:", type(error).__name__)
        print("DETAILS:", str(error))