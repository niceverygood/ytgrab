import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import MyPage from './pages/MyPage.jsx'
import Community from './pages/Community.jsx'
import UserProfile from './pages/UserProfile.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/my" element={<MyPage />} />
        <Route path="/community" element={<Community />} />
        <Route path="/user/:username" element={<UserProfile />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
