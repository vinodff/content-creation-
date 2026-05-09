import React, { useState, useEffect } from 'react';
import { Search, Loader2, Youtube, TrendingUp, ThumbsUp, MessageSquare, Clock, Users, ArrowRight, Trophy, AlertCircle, X, Plus, Trash2, LayoutGrid, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";

interface Group {
  id: string;
  name: string;
  channels: string[];
}

export default function App() {
  const [groups, setGroups] = useState<Group[]>(() => {
    try {
      const saved = localStorage.getItem('youtube_groups');
      if (saved) return JSON.parse(saved);
      // Migrate old agents if they exist, otherwise default group
      const oldAgents = localStorage.getItem('youtube_agents');
      if (oldAgents) {
        const parsed = JSON.parse(oldAgents);
        if (parsed.length > 0) return parsed;
      }
      return [{ id: 'default', name: 'My First Group', channels: [] }];
    } catch {
      return [{ id: 'default', name: 'My First Group', channels: [] }];
    }
  });
  
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups.length > 0 ? groups[0].id : '');
  const [channelInput, setChannelInput] = useState('');
  const [days, setDays] = useState('2');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  
  // Custom Modals/Inline forms state
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // Script Generator state
  const [scriptPromptModal, setScriptPromptModal] = useState<{video: any, channelName: string, isInstagram?: boolean, caption?: string} | null>(null);
  const [sampleStyle, setSampleStyle] = useState('');
  const [generatingScriptId, setGeneratingScriptId] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<{title: string, content: string, sampleUsed?: string} | null>(null);

  useEffect(() => {
    localStorage.setItem('youtube_groups', JSON.stringify(groups));
  }, [groups]);

  // Ensure a selected group exists
  useEffect(() => {
    if (!groups.find(g => g.id === selectedGroupId) && groups.length > 0) {
      setSelectedGroupId(groups[0].id);
      setResults(null);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const submitCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName && newGroupName.trim()) {
      const newGroup = { id: crypto.randomUUID(), name: newGroupName.trim(), channels: [] };
      setGroups([...groups, newGroup]);
      setSelectedGroupId(newGroup.id);
      setResults(null);
      setIsCreatingGroup(false);
      setNewGroupName('');
    }
  };

  const confirmDeleteGroup = () => {
    if (deletingGroupId) {
      setGroups(groups.filter(g => g.id !== deletingGroupId));
      if (selectedGroupId === deletingGroupId) setResults(null);
      setDeletingGroupId(null);
    }
  };

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const newChannel = channelInput.trim();
    if (!newChannel || !selectedGroup) return;

    if (!selectedGroup.channels.includes(newChannel)) {
      setGroups(groups.map(g => 
        g.id === selectedGroup.id 
          ? { ...g, channels: [...g.channels, newChannel] }
          : g
      ));
      // Clear results because group has changed
      setResults(null);
    }
    setChannelInput('');
  };

  const handleRemoveChannel = (channelToRemove: string) => {
    if (!selectedGroup) return;
    setGroups(groups.map(g => 
      g.id === selectedGroup.id
        ? { ...g, channels: g.channels.filter(c => c !== channelToRemove) }
        : g
    ));
    setResults(null);
  };

  const handleCompare = async () => {
    if (!selectedGroup || selectedGroup.channels.length === 0) {
      setError('Please add at least one channel to the group.');
      return;
    }
    
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const fetchPromises = selectedGroup.channels.map(async (channel) => {
        try {
          const res = await fetch(`/api/youtube/best-video?channel=${encodeURIComponent(channel)}&days=${days}`);
          const data = await res.json();
          if (!res.ok) {
            return { channelInput: channel, error: data.error || 'Failed to analyze channel' };
          }
          return { channelInput: channel, ...data };
        } catch (err: any) {
          return { channelInput: channel, error: err.message || 'Network error' };
        }
      });
      
      const allResults = await Promise.all(fetchPromises);
      setResults(allResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!scriptPromptModal) return;
    const { video, channelName } = scriptPromptModal;
    
    setGeneratingScriptId(video.id);
    try {
      const aiAPIKey = process.env.GEMINI_API_KEY;
      if (!aiAPIKey) {
        throw new Error('Gemini API Key is missing. Please configure it in the Secrets panel.');
      }

      const ai = new GoogleGenAI({ apiKey: aiAPIKey });
      
      // Prefer video captions as primary source, fallback to global sampleStyle
      let effectiveStyle = video.captions || scriptPromptModal?.caption || '';
      if (!effectiveStyle && sampleStyle && sampleStyle.trim().length > 0) {
        effectiveStyle = sampleStyle.trim();
      }
      
      let promptText = `You are a professional YouTube scriptwriter. Your goal is to write a CLEAN, production-ready script.
Do NOT include timestamps, camera angles, visual cues (like [00:00]), or extra metadata. 
Focus ONLY on the spoken dialogue and major headers (Introduction, Body, Outro).

Context:
Channel Name: ${channelName}
Video Title: ${video.title}

Instruction: Write a clean, engaging YouTube script in PLAIN TEXT. No timestamps.`;

      if (effectiveStyle && effectiveStyle.length > 0) {
        promptText += `

CRITICAL STYLE REQUIREMENT:
Adopt the EXACT tone, pacing, and vocabulary of the provided source script below.
The output must feel like it was written by the same author.

<source_reference>
${effectiveStyle}
</source_reference>

Generate ONLY the clean script text. Do not repeat the title or include metadata.`;
      } else {
        promptText += ` Emphasize pacing, visual cues, and audience engagement. Write it in a clean, plain-text format.`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: promptText
      });

      const scriptContent = response.text || '';
      
      setGeneratedScript({
        title: video.title,
        content: scriptContent,
        sampleUsed: effectiveStyle && effectiveStyle.trim().length > 0 ? effectiveStyle.trim() : undefined
      });
      setScriptPromptModal(null);
    } catch (err: any) {
      alert("Error generating script: " + err.message);
    } finally {
      setGeneratingScriptId(null);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Find overall best video and sort results
  let topViews = 0;
  let topVideoId = '';
  let sortedResults = results ? [...results] : null;

  if (sortedResults) {
    sortedResults.sort((a, b) => {
      // Push errors to the bottom
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      const viewsA = a.bestVideo?.views || 0;
      const viewsB = b.bestVideo?.views || 0;
      return viewsB - viewsA;
    });

    if (sortedResults.length > 0 && !sortedResults[0].error && sortedResults[0].bestVideo) {
      topViews = sortedResults[0].bestVideo.views;
      topVideoId = sortedResults[0].bestVideo.id;
    }
  }

  return (
    <div className="flex h-screen bg-neutral-50 text-neutral-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r border-neutral-200 flex flex-col flex-shrink-0 relative z-10 shadow-sm">
        <div className="p-5 border-b border-neutral-100 flex items-center gap-3">
          <div className="bg-red-600 text-white p-2 rounded-xl shadow-sm">
             <Youtube className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">YT Analyzer</h1>
        </div>
        
        <div className="p-4 flex flex-col flex-grow overflow-y-auto">
          <div className="flex items-center justify-between mb-4 mt-2">
            <h2 className="text-xs font-bold tracking-wider text-neutral-500 uppercase">Your Groups</h2>
            <button 
              onClick={() => setIsCreatingGroup(true)}
              className="text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-md p-1 focus:outline-none transition-colors"
              title="Create new group"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1.5 flex-grow">
            {isCreatingGroup && (
              <form onSubmit={submitCreateGroup} className="mb-4">
                <input 
                   autoFocus
                   type="text" 
                   value={newGroupName} 
                   onChange={e => setNewGroupName(e.target.value)} 
                   placeholder="Group name" 
                   className="w-full text-sm px-3 py-2 border border-neutral-300 rounded-md mb-2 outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
                />
                <div className="flex gap-2">
                   <button type="button" onClick={() => setIsCreatingGroup(false)} className="flex-1 px-2 py-1 text-xs font-medium bg-neutral-100 hover:bg-neutral-200 rounded-md text-neutral-600 transition-colors">Cancel</button>
                   <button type="submit" disabled={!newGroupName.trim()} className="flex-1 px-2 py-1 text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-white rounded-md disabled:opacity-50 transition-colors">Save</button>
                </div>
              </form>
            )}
            {groups.length === 0 && !isCreatingGroup && (
              <div className="text-sm text-neutral-400 p-3 text-center border border-dashed border-neutral-200 rounded-lg">
                No groups created yet.
              </div>
            )}
            {groups.map(group => (
              <div 
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setResults(null);
                }}
                className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                  selectedGroupId === group.id 
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-md' 
                    : 'bg-transparent text-neutral-600 border-transparent hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <LayoutGrid className={`w-4 h-4 flex-shrink-0 ${selectedGroupId === group.id ? 'text-neutral-300' : 'text-neutral-400'}`} />
                  <span className="font-semibold text-sm truncate">{group.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingGroupId(group.id);
                  }}
                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg ${
                    selectedGroupId === group.id ? 'hover:bg-neutral-800 text-neutral-400 hover:text-red-400' : 'hover:bg-neutral-200 text-neutral-400 hover:text-red-500'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto relative">
        {selectedGroup ? (
          <div className="max-w-6xl w-full mx-auto p-8 pt-10">
            {/* Group Header */}
            <div className="mb-10">
              <h2 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-3">{selectedGroup.name}</h2>
              <p className="text-neutral-500 text-lg">Manage channels inside this group and compare their performance.</p>
            </div>

            {/* Channels Management */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200 mb-8">
              <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" /> Channels in Group ({selectedGroup.channels.length})
              </h3>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedGroup.channels.length === 0 ? (
                  <div className="text-sm text-neutral-400 italic">No channels added yet.</div>
                ) : (
                  selectedGroup.channels.map((channel, i) => (
                    <div key={i} className="flex items-center gap-2 pl-3 pr-1 py-1.5 bg-neutral-100 border border-neutral-200 rounded-lg">
                      <span className="text-sm font-semibold text-neutral-800">{channel}</span>
                      <button 
                        onClick={() => handleRemoveChannel(channel)}
                        className="p-1 hover:bg-neutral-200 rounded-md text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddChannel} className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <div className="relative flex-grow max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-neutral-400" />
                    </div>
                    <input
                      type="text"
                      value={channelInput}
                      onChange={(e) => setChannelInput(e.target.value)}
                      placeholder="Enter YT channel or IG profile (e.g. @mkbhd, instagram.com/zuck)"
                      className="w-full h-11 pl-10 pr-4 bg-neutral-50 border border-neutral-200 rounded-xl outline-none text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white transition-colors font-medium text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!channelInput.trim()}
                    className="h-11 px-5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>

                <div className="pt-2 border-t border-neutral-100 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest">Global Style Reference (AI Generator)</label>
                  </div>
                  <textarea
                    value={sampleStyle}
                    onChange={(e) => setSampleStyle(e.target.value)}
                    placeholder="Paste a script here (e.g. from a successful previous video) to teach the AI your tone, pacing, and hooks..."
                    className="w-full h-28 p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none text-neutral-900 focus:border-purple-400 focus:bg-white transition-all text-sm resize-none shadow-inner"
                  ></textarea>
                </div>
              </form>
            </div>

            {/* Compare Controls */}
            {selectedGroup.channels.length > 0 && (
              <div className="flex items-center gap-4 bg-white p-2 pl-4 rounded-2xl shadow-sm border border-neutral-200 w-max mb-8">
                <span className="text-sm font-semibold text-neutral-500">Timeframe:</span>
                <select
                  value={days}
                  onChange={(e) => {
                    setDays(e.target.value);
                    setResults(null); 
                  }}
                  className="h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-lg outline-none text-neutral-900 font-semibold cursor-pointer text-sm"
                >
                  <option value="1">Last 24 Hours</option>
                  <option value="2">Last 2 Days</option>
                  <option value="5">Last 5 Days</option>
                  <option value="7">Last Week</option>
                  <option value="30">Last Month</option>
                </select>
                
                <button
                  onClick={handleCompare}
                  disabled={loading}
                  className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 ml-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4" /> Compare Now
                    </>
                  )}
                </button>
              </div>
            )}

            {error && (
              <div className="w-full mb-8 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm font-medium flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
              </div>
            )}

            {/* Results Grid */}
            {results && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                <div className="flex items-center gap-2 mb-6">
                  <h3 className="text-xl font-bold tracking-tight text-neutral-900">Analysis Results</h3>
                  <div className="px-2.5 py-1 rounded-full bg-neutral-200 text-neutral-600 text-xs font-bold">
                    {days} Day{days !== '1' ? 's' : ''}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedResults.map((res, index) => {
                    if (res.isInstagram) {
                      const isTopVideo = res.bestVideo && res.bestVideo.id === topVideoId && topVideoId !== '';
                      
                      if (res.error && !res.bestVideo) {
                        return (
                          <div key={index} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl overflow-hidden shadow-sm border border-pink-100 flex flex-col">
                            <div className="p-5 flex items-center gap-3 bg-white/60 border-b border-pink-100">
                              <img 
                                src={res.channel.thumbnail} 
                                alt="Instagram" 
                                className="w-12 h-12 rounded-full border border-pink-200 object-cover bg-white p-1"
                              />
                              <div className="flex-grow min-w-0">
                                <h3 className="font-bold truncate text-pink-900 text-base">{res.channel.title}</h3>
                                <div className="text-pink-600 font-medium text-xs mt-0.5">
                                  Instagram Profile
                                </div>
                              </div>
                            </div>
                            <div className="flex-grow p-8 flex flex-col justify-center items-center text-center bg-white/40">
                              <div className="w-12 h-12 bg-pink-100 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertCircle className="w-6 h-6" />
                              </div>
                              <h3 className="text-sm font-bold text-neutral-900 mb-2">API Error</h3>
                              <p className="text-xs text-neutral-600 max-w-[250px] leading-relaxed">
                                {res.error}
                              </p>
                              {res.error.includes('token') || res.error.includes('Creator') || res.error.includes('linked Instagram Page') ? (
                                <div className="mt-4 text-left bg-pink-50 p-3 rounded-lg border border-pink-100 text-xs text-neutral-800">
                                  <span className="font-bold block mb-1">Checklist for Creator Accounts:</span>
                                  <ul className="list-disc pl-4 space-y-1">
                                    <li>Even as a Creator, Facebook's API requires linking to a Facebook Page.</li>
                                    <li>In the IG App, go to Settings &gt; Business/Creator tools &gt; Connect a Facebook Page.</li>
                                    <li>When generating your token in Graph API Explorer, you <b>MUST</b> include <code className="text-[10px] bg-white px-1 rounded">pages_show_list</code> and <code className="text-[10px] bg-white px-1 rounded">pages_read_engagement</code> permissions.</li>
                                    <li>Without these 'pages' permissions, the API cannot access your Creator account.</li>
                                  </ul>
                                </div>
                              ) : null}
                              {res.error.includes('Configuration Required') && (
                                <a href="https://developers.facebook.com/docs/instagram" target="_blank" rel="noreferrer" className="mt-4 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold rounded-lg transition-colors">
                                  Setup Graph API
                                </a>
                              )}
                            </div>
                          </div>
                        )
                      }
                      
                      // Success case for Instagram Video
                      return (
                        <div key={index} className={`bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl overflow-hidden shadow-sm border transition-all ${isTopVideo ? 'border-pink-400 ring-2 ring-pink-400/20 md:col-span-2 lg:col-span-3 flex flex-col lg:flex-row' : 'flex flex-col border-pink-100'}`}>
                          {/* Channel Info */}
                          <div className={`p-5 flex items-center gap-3 bg-white/60 ${isTopVideo ? 'border-b lg:border-b-0 lg:border-r border-pink-100 lg:w-[220px] lg:flex-col lg:justify-center lg:items-center lg:text-center flex-shrink-0' : 'border-b border-pink-100'}`}>
                            <img 
                              src={res.channel.thumbnail} 
                              alt={res.channel.title} 
                              className={`rounded-full border border-pink-200 object-cover bg-white p-0.5 ${isTopVideo ? 'w-20 h-20 mb-2' : 'w-12 h-12'}`}
                            />
                            <div className="flex-grow min-w-0">
                              <h3 className={`font-bold truncate text-pink-900 ${isTopVideo ? 'text-lg' : 'text-base'}`} title={res.channel.title}>{res.channel.title}</h3>
                              <div className={`flex items-center gap-1.5 text-pink-600 font-medium ${isTopVideo ? 'text-sm justify-center mt-1' : 'text-xs mt-0.5'}`}>
                                <Users className="w-3.5 h-3.5" />
                                <span>{res.channel.subscriberCount ? formatNumber(parseInt(res.channel.subscriberCount)) : '--'}</span>
                              </div>
                            </div>
                            {isTopVideo && (
                              <div className="bg-gradient-to-br from-pink-400 to-purple-500 text-white p-2 rounded-full flex-shrink-0 shadow-sm mt-auto lg:mt-4 hidden lg:flex" title="Most Engagement Overall">
                                <Trophy className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                          
                          {/* Video Card */}
                          {res.bestVideo && (
                            <div className={`flex flex-col flex-grow ${isTopVideo ? 'lg:flex-row' : ''}`}>
                              <a href={res.bestVideo.url} target="_blank" rel="noreferrer" className={`block relative group flex-shrink-0 ${isTopVideo ? 'lg:w-[400px]' : ''}`}>
                                <div className="aspect-video relative overflow-hidden bg-neutral-900 h-full flex items-center justify-center">
                                  <img 
                                    src={res.bestVideo.thumbnail} 
                                    alt={res.bestVideo.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur text-pink-600 text-[10px] font-black px-2 py-1 rounded shadow-md">
                                    INSTAGRAM
                                  </div>
                                  {isTopVideo && (
                                      <div className="absolute top-4 right-4 bg-pink-500 text-white text-[10px] uppercase font-black px-3 py-1.5 rounded flex items-center gap-1 shadow-md tracking-wider">
                                        <Trophy className="w-3.5 h-3.5" /> Winner
                                      </div>
                                  )}
                                </div>
                              </a>
                              
                              <div className="p-6 flex flex-col flex-grow justify-center bg-white/40">
                                <a href={res.bestVideo.url} target="_blank" rel="noreferrer" className={`group ${isTopVideo ? 'mb-4' : 'mb-auto'}`}>
                                  <h4 className={`font-bold text-neutral-900 group-hover:text-pink-600 transition-colors leading-snug ${isTopVideo ? 'text-xl md:text-2xl line-clamp-3' : 'text-lg line-clamp-2'}`}>
                                      {res.bestVideo.title}
                                  </h4>
                                </a>
                                
                                {isTopVideo && (
                                  <div className="text-neutral-500 text-sm mb-6 line-clamp-2 mt-2 leading-relaxed">
                                    Based on analyzed latest reels and posts.
                                  </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-2 pt-5 border-t border-pink-100/50 mb-5">
                                  <div>
                                    <div className={`font-bold text-neutral-900 ${isTopVideo ? 'text-xl' : 'text-lg'}`}>{formatNumber(res.bestVideo.likes)}</div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mt-0.5 flex items-center gap-1">
                                      <ThumbsUp className="w-3 h-3" /> Likes
                                    </div>
                                  </div>
                                  <div>
                                    <div className={`font-bold text-neutral-900 ${isTopVideo ? 'text-xl' : 'text-lg'}`}>{formatNumber(res.bestVideo.comments)}</div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mt-0.5 flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" /> Comments
                                    </div>
                                  </div>
                                </div>
                                
                                <button 
                                  onClick={() => {
                                    setScriptPromptModal({ video: res.bestVideo, channelName: res.channel.title, isInstagram: true, caption: res.captions });
                                  }}
                                  disabled={generatingScriptId === res.bestVideo.id}
                                  className={`w-full flex items-center justify-center gap-2 py-3 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 mt-auto ${
                                    isTopVideo ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-md shadow-pink-200/50' : 'bg-pink-100 hover:bg-pink-200 text-pink-900'
                                  }`}
                                >
                                  {generatingScriptId === res.bestVideo.id ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                                  ) : (
                                    <><Sparkles className={`w-4 h-4 ${isTopVideo ? 'text-white' : 'text-pink-600'}`} /> Generate Script</>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }

                    if (res.error) {
                      return (
                        <div key={index} className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200 flex flex-col justify-center items-center text-center h-[350px]">
                          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                          <h3 className="font-semibold text-neutral-900 mb-1">{res.channelInput}</h3>
                          <p className="text-sm text-red-600">{res.error}</p>
                        </div>
                      );
                    }

                    const isTopVideo = res.bestVideo && res.bestVideo.id === topVideoId && topVideoId !== '';

                    return (
                      <div key={index} className={`bg-white rounded-3xl overflow-hidden shadow-sm border transition-all ${isTopVideo ? 'border-yellow-400 ring-2 ring-yellow-400/20 md:col-span-2 lg:col-span-3 flex flex-col lg:flex-row' : 'flex flex-col border-neutral-200'}`}>
                        {/* Channel Info */}
                        <div className={`p-5 flex items-center gap-3 bg-neutral-50/50 ${isTopVideo ? 'border-b lg:border-b-0 lg:border-r border-neutral-100 lg:w-[220px] lg:flex-col lg:justify-center lg:items-center lg:text-center flex-shrink-0' : 'border-b border-neutral-100'}`}>
                          <img 
                            src={res.channel.thumbnail} 
                            alt={res.channel.title} 
                            className={`rounded-full border border-neutral-200 object-cover bg-white ${isTopVideo ? 'w-20 h-20 mb-2' : 'w-12 h-12'}`}
                          />
                          <div className="flex-grow min-w-0">
                            <h3 className={`font-bold truncate text-neutral-900 ${isTopVideo ? 'text-lg' : 'text-base'}`} title={res.channel.title}>{res.channel.title}</h3>
                            <div className={`flex items-center gap-1.5 text-neutral-500 font-medium ${isTopVideo ? 'text-sm justify-center mt-1' : 'text-xs mt-0.5'}`}>
                              <Users className="w-3.5 h-3.5" />
                              <span>{res.channel.subscriberCount ? formatNumber(parseInt(res.channel.subscriberCount)) : '--'}</span>
                            </div>
                          </div>
                          {isTopVideo && (
                            <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 text-yellow-950 p-2 rounded-full flex-shrink-0 shadow-sm mt-auto lg:mt-4 hidden lg:flex" title="Most Views Overall">
                              <Trophy className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {/* Video Card */}
                        {res.bestVideo ? (
                          <div className={`flex flex-col flex-grow ${isTopVideo ? 'lg:flex-row' : ''}`}>
                            <a href={res.bestVideo.url} target="_blank" rel="noreferrer" className={`block relative group flex-shrink-0 ${isTopVideo ? 'lg:w-[400px]' : ''}`}>
                              <div className="aspect-video relative overflow-hidden bg-neutral-100 h-full">
                                <img 
                                  src={res.bestVideo.thumbnail} 
                                  alt={res.bestVideo.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                {isTopVideo && (
                                    <div className="absolute top-4 right-4 bg-yellow-400 text-yellow-950 text-[10px] uppercase font-black px-3 py-1.5 rounded flex items-center gap-1 shadow-md tracking-wider">
                                      <Trophy className="w-3.5 h-3.5" /> Winner
                                    </div>
                                )}
                              </div>
                            </a>
                            <div className="p-6 flex flex-col flex-grow justify-center">
                              <a href={res.bestVideo.url} target="_blank" rel="noreferrer" className={`group ${isTopVideo ? 'mb-4' : 'mb-auto'}`}>
                                <h4 className={`font-bold text-neutral-900 group-hover:text-blue-600 transition-colors leading-snug ${isTopVideo ? 'text-xl md:text-2xl line-clamp-3' : 'text-lg line-clamp-2'}`}>
                                    {res.bestVideo.title}
                                </h4>
                              </a>
                              <p className="text-xs text-neutral-500 mt-2.5 flex items-center gap-1.5 mb-6 font-medium">
                                <Clock className="w-3.5 h-3.5" />
                                {formatDate(res.bestVideo.publishedAt)}
                              </p>
                              
                              <div className="grid grid-cols-3 gap-2 pt-5 border-t border-neutral-100 mb-5">
                                <div>
                                  <div className={`font-bold text-neutral-900 ${isTopVideo ? 'text-xl' : 'text-lg'}`}>{formatNumber(res.bestVideo.views)}</div>
                                  <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mt-0.5">Views</div>
                                </div>
                                <div>
                                  <div className={`font-bold text-neutral-900 ${isTopVideo ? 'text-xl' : 'text-lg'}`}>{formatNumber(res.bestVideo.likes)}</div>
                                  <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mt-0.5 flex items-center gap-1">
                                    <ThumbsUp className="w-3 h-3" /> Likes
                                  </div>
                                </div>
                                <div>
                                  <div className={`font-bold text-neutral-900 ${isTopVideo ? 'text-xl' : 'text-lg'}`}>{formatNumber(res.bestVideo.comments)}</div>
                                  <div className="text-[10px] uppercase tracking-wider font-bold text-neutral-400 mt-0.5 flex items-center gap-1">
                                    <MessageSquare className="w-3 h-3" /> Comments
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => {
                                  setScriptPromptModal({ video: res.bestVideo, channelName: res.channel.title });
                                }}
                                disabled={generatingScriptId === res.bestVideo.id}
                                className={`w-full flex items-center justify-center gap-2 py-3 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 mt-auto ${
                                  isTopVideo ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-200/50' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                                }`}
                              >
                                {generatingScriptId === res.bestVideo.id ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                                ) : (
                                  <><Sparkles className={`w-4 h-4 ${isTopVideo ? 'text-white' : 'text-purple-600'}`} /> Generate Script</>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                            <div className="flex-grow p-8 flex flex-col justify-center items-center text-center bg-neutral-50/50">
                                <div className="w-12 h-12 bg-neutral-200 text-neutral-400 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-bold text-neutral-900 mb-1">No recent videos</h3>
                                <p className="text-xs text-neutral-500">In the last {days} days</p>
                            </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 bg-neutral-100 text-neutral-300 rounded-full flex items-center justify-center mb-4">
              <LayoutGrid className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">No Group Selected</h2>
            <p className="text-neutral-500 max-w-sm">Select a group from the sidebar or create a new one to start analyzing channels.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingGroupId && (
        <div className="fixed inset-0 bg-neutral-900/40 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
             <h3 className="text-lg font-bold text-neutral-900 mb-2">Delete Group</h3>
             <p className="text-neutral-500 mb-6 text-sm">Are you sure you want to delete this group? This action cannot be undone.</p>
             <div className="flex gap-3 justify-end">
                <button onClick={() => setDeletingGroupId(null)} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">Cancel</button>
                <button onClick={confirmDeleteGroup} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Delete</button>
             </div>
          </div>
        </div>
      )}

      {/* Script Prompt Modal */}
      {scriptPromptModal && (
        <div className="fixed inset-0 bg-neutral-900/60 z-[65] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6 flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Generate Script?</h3>
                <p className="text-neutral-500 text-sm mb-6">
                  Ready to draft a script for <span className="font-bold text-neutral-900">"{scriptPromptModal.video.title}"</span>? 
                  {sampleStyle ? " We'll use your provided style reference." : " We'll use a default engaging YouTube style."}
                </p>
                
                <div className="flex w-full gap-3">
                  <button 
                    onClick={() => setScriptPromptModal(null)} 
                    className="flex-1 py-3 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors disabled:opacity-50"
                    disabled={generatingScriptId !== null}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleGenerateScript}
                    disabled={generatingScriptId !== null}
                    className="flex-1 py-3 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-75"
                  >
                    {generatingScriptId !== null ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Working...</>
                    ) : (
                      "Start Generation"
                    )}
                  </button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Generated Script Modal */}
      {generatedScript && (
        <div className="fixed inset-0 bg-neutral-900/60 z-[70] flex items-center justify-center p-4 sm:p-8 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-6 border-b border-neutral-100 flex items-start justify-between bg-neutral-50/50">
                <div className="pr-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-2">
                    <Sparkles className="w-5 h-5" />
                    <span className="font-bold text-sm tracking-wide uppercase">AI Script Generated</span>
                  </div>
                  <h3 className="text-xl font-bold text-neutral-900 leading-tight">{generatedScript.title}</h3>
                </div>
                <button 
                  onClick={() => setGeneratedScript(null)} 
                  className="p-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-600 rounded-full transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
             </div>
             
             <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-neutral-50/50">
                {/* Left Column: Style Reference */}
                <div className="w-full md:w-1/2 border-b md:border-b-0 md:border-r border-neutral-200 flex flex-col h-[40vh] md:h-auto">
                   <div className="px-6 py-3 bg-neutral-100/80 border-b border-neutral-200 flex items-center gap-2 shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-400"></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Actual Video Script (Captions)</span>
                   </div>
                   <div className="p-6 overflow-y-auto bg-neutral-50 text-sm text-neutral-600 whitespace-pre-wrap italic leading-relaxed flex-1">
                      {generatedScript.sampleUsed && generatedScript.sampleUsed.length > 0 ? (
                        generatedScript.sampleUsed
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-neutral-400/60 py-10 px-4 text-center">
                          <Sparkles className="w-8 h-8 mb-3 opacity-20" />
                          <p className="italic font-medium">No script detected.</p>
                          <p className="text-[10px] mt-2 not-italic leading-relaxed">
                            We couldn't fetch captions for this video and no manual style reference was provided. 
                            AI generated a script using its default high-retention model.
                          </p>
                        </div>
                      )}
                   </div>
                </div>
                
                {/* Right Column: AI Output */}
                <div className="w-full md:w-1/2 flex flex-col h-[50vh] md:h-auto">
                   <div className="px-6 py-3 bg-white border-b border-neutral-100 flex items-center gap-2 shrink-0 shadow-sm z-10">
                     <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                     <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">AI Generated Script (Output)</span>
                   </div>
                   <div className="p-6 overflow-y-auto markdown-body flex-1 bg-white">
                     <ReactMarkdown>{generatedScript.content}</ReactMarkdown>
                   </div>
                </div>
             </div>
             
             <div className="p-5 border-t border-neutral-100 bg-neutral-50/50 flex justify-end shrink-0">
                <button 
                  onClick={() => setGeneratedScript(null)} 
                  className="px-6 py-2.5 text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors"
                >
                  Close
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
