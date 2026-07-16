/* App.jsx */
import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/login/login';
import Register from './pages/register/register';
import Start from './pages/start/start';
import Main from './pages/main/main';
import Interview from './pages/interview/interview';
import Mypage from './pages/mypage/mypage';

function App() {
  const [startVideoUrl, setStartVideoUrl] = useState(null);
  const [mainVideoUrl, setMainVideoUrl] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let mainObjectUrl = null;

    const preloadStartVideo = async () => {
      try {
        const response = await fetch('assets/start.mp4');
        const mainResponse = await fetch('assets/main.mp4');

        if (!response.ok) {
          throw new Error(`시작 영상 로드 실패: ${response.status}`);
        }

        if (!mainResponse.ok) {
          throw new Error(`메인 영상 로드 실패: ${mainResponse.status}`);
        }

        const videoBlob = await response.blob();
        const mainVideoBlob = await mainResponse.blob();
        objectUrl = URL.createObjectURL(videoBlob);
        mainObjectUrl = URL.createObjectURL(mainVideoBlob);

        setStartVideoUrl(objectUrl);
        setMainVideoUrl(mainObjectUrl);
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
        <Route
          path="/"
          element={<Main mainVideoUrl={mainVideoUrl} />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/start"
          element={<Start startVideoUrl={startVideoUrl} />}
        />
        <Route path="/interview" element={<Interview />} />
        <Route path="/mypage" element={<Mypage />} />
      </Routes>
    </Router>
  );
}

export default App;