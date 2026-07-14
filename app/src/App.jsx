/* App.jsx */
import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/login/login';
import Start from './pages/start/start';
import Main from './pages/main/main';

function App() {
  const [startVideoUrl, setStartVideoUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;

    const preloadStartVideo = async () => {
      try {
        const response = await fetch('assets/start.mp4');

        if (!response.ok) {
          throw new Error(`시작 영상 로드 실패: ${response.status}`);
        }

        const videoBlob = await response.blob();
        objectUrl = URL.createObjectURL(videoBlob);

        setStartVideoUrl(objectUrl);
        console.log('시작 영상 미리 로드 성공');
      } catch (error) {
        console.error('영상 미리 로드 실패:', error);
      }
    };

    preloadStartVideo();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/start"
          element={<Start startVideoUrl={startVideoUrl} />}
        />
        <Route path="/main" element={<Main />} />
      </Routes>
    </Router>
  );
}

export default App;