import { useState, useRef } from 'react';
import axios from 'axios';
import { Send, Upload, X, FileUp } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3003';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

export default function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '👋 Hej Jag är din bstr assistent vad vill du ha hjälp med ?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadContent, setUploadContent] = useState('');
  const [uploadType, setUploadType] = useState('text');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadContent(file.name); 
    } else {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error: Endast PDF-filer är tillåtna.'
      }]);
    }
  };

  const handleUpload = async () => {
    try {
      setLoading(true);
      let payload;

      if (uploadType === 'pdf' && selectedFile) {
        
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('type', 'pdf');

       
        const response = await axios.post(`${API_BASE_URL}/api/load-documents`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          }
        });

        payload = response.data;
      } else {
       
        payload = {
          type: uploadType,
          [uploadType === 'url' ? 'url' : 'content']: uploadContent
        };

        await axiosInstance.post('/api/load-documents', payload);
      }
      
      setShowUpload(false);
      setUploadContent('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Training data uploaded successfully!'
      }]);
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage;

      if (uploadType === 'url') {
        if (error.message.includes('CORS') || error.message.includes('Network Error')) {
          errorMessage = 'Åtkomst nekad: Kunde inte nå den angivna URL:en. Kontrollera att webbplatsen tillåter åtkomst.';
        } else if (error.response?.status === 403) {
          errorMessage = 'Åtkomst nekad: Webbplatsen blockerar åtkomst till innehållet.';
        } else if (error.response?.status === 404) {
          errorMessage = 'URL:en kunde inte hittas. Kontrollera att adressen är korrekt.';
        } else {
          errorMessage = 'Kunde inte hämta innehåll från URL:en. Försök med en annan URL eller använd textinmatning istället.';
        }
      } else if (uploadType === 'pdf') {
        errorMessage = 'Kunde inte ladda upp PDF-filen. Kontrollera att filen är korrekt och försök igen.';
      } else {
        errorMessage = error.response?.data?.error || error.message;
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${errorMessage}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      setLoading(true);
      const response = await axiosInstance.post('/api/chat', {
        question: userMessage
      });
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.answer 
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error: ' + (error.response?.data?.error || error.message)
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="w-full max-w-4xl mx-auto flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="h-3 w-3 rounded-full bg-gray-400"></div>
            <span className="text-gray-200 font-medium">Bostr AI</span>
          </div>
          <button onClick={() => setShowUpload(!showUpload)}>
            <Upload className="h-5 w-5 text-gray-400 hover:text-gray-200" />
          </button>
        </div>

        {showUpload && (
          <div className="p-4 bg-gray-800 border-b border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-gray-200">Upload Training Data</h3>
              <button onClick={() => setShowUpload(false)}>
                <X className="h-5 w-5 text-gray-400 hover:text-gray-200" />
              </button>
            </div>
            <select 
              className="w-full p-2 mb-2 bg-gray-700 text-gray-200 rounded border border-gray-600"
              value={uploadType}
              onChange={(e) => {
                setUploadType(e.target.value);
                setUploadContent('');
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              <option value="text">Text</option>
              <option value="url">URL</option>
              <option value="pdf">PDF File</option>
            </select>

            {uploadType === 'pdf' ? (
              <div className="mb-2">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  className="hidden"
                  id="pdf-upload"
                />
                <label 
                  htmlFor="pdf-upload"
                  className="flex items-center justify-center w-full p-2 bg-gray-700 text-gray-200 rounded border border-gray-600 cursor-pointer hover:bg-gray-600"
                >
                  <FileUp className="h-5 w-5 mr-2" />
                  {selectedFile ? selectedFile.name : 'Välj PDF-fil'}
                </label>
              </div>
            ) : (
              <textarea
                className="w-full p-2 mb-2 bg-gray-700 text-gray-200 rounded border border-gray-600"
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder={uploadType === 'url' ? 'Enter URL...' : 'Enter text...'}
                rows={4}
              />
            )}

            <button
              onClick={handleUpload}
              disabled={loading || (!uploadContent && !selectedFile)}
              className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-600"
            >
              {loading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-200'
              }`}>
                {message.content}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Skriv ditt Meddelande..."
              className="flex-1 p-2 bg-gray-800 text-gray-200 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-700"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}