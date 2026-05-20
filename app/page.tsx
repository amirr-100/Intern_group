'use client';

import React, { useState, useEffect } from 'react';

export default function AttendanceForm() {
  const [formData, setFormData] = useState({
    fullName: '',
    phoneNumber: '',
    email: '',
    institution: '',
    designation: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!formData.phoneNumber.trim()) newErrors.phoneNumber = "Phone number is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Invalid email address";
    

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
 
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 2800);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-6xl w-full grid md:grid-cols-2 gap-0 overflow-hidden rounded-3xl shadow-2xl bg-white border border-slate-200">
        
        {/* Left Panel - Professional Gradient */}
        <div className="bg-gradient-to-br from-slate-900 to-blue-950 p-12 flex flex-col justify-center relative text-white">
          <div className="mb-10">
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-5 py-2 rounded-2xl">
               <div>
                <div className="text-white text-xl font-semibold tracking-wide">SMART ATTENDANCE</div>
                <div className="text-blue-300 text-sm -mt-1">User Check-in Flow</div>
              </div>
              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">Live Session</span>
            </div>
          </div>

          <h1 className="text-5xl font-semibold leading-tight mb-6">
            Welcome to<br />Events and Sessions
          </h1>
          
          <p className="text-slate-300 text-lg max-w-md">
            Please complete the form below to mark your attendance. 
            Your information is secure and confidential.
          </p>

          <div className="mt-auto pt-16 text-sm text-slate-400">

          </div>
        </div>

        {/* Right Side - Clean Professional Form */}
        <div className="p-12 bg-white text-slate-900 flex flex-col">
          <div className="mb-10">
            <h2 className="text-3xl font-semibold text-slate-900">Check-in Form</h2>
            <p className="text-slate-600 mt-2">Fill in your details to confirm attendance</p>
          </div>

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-7 flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">FULL NAME</label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all text-lg"
                  placeholder="Victor Smith"
                />
                {errors.fullName && <p className="text-red-500 text-sm mt-1.5">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">PHONE NUMBER</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all text-lg"
                  placeholder="+232 78 123 456"
                />
                {errors.phoneNumber && <p className="text-red-500 text-sm mt-1.5">{errors.phoneNumber}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">EMAIL ADDRESS</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all text-lg"
                  placeholder="example@gmail.com"
                />
                {errors.email && <p className="text-red-500 text-sm mt-1.5">{errors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">INSTITUTION</label>
                  <input
                    type="text"
                    name="institution"
                    value={formData.institution}
                    onChange={handleChange}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
                    placeholder="OPtional"
                  />
                  {errors.institution && <p className="text-red-500 text-sm mt-1.5">{errors.institution}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">DESIGNATION</label>
                  <input
                    type="text"
                    name="designation"
                    value={formData.designation}
                    onChange={handleChange}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
                    placeholder="Optional"
                  />
                  {errors.designation && <p className="text-red-500 text-sm mt-1.5">{errors.designation}</p>}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-10 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-all text-white font-semibold text-lg py-5 rounded-2xl disabled:opacity-70 shadow-lg shadow-blue-500/30 flex items-center justify-center gap-3"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                    CONFIRMING ATTENDANCE...
                  </>
                ) : (
                  "CONFIRM ATTENDANCE"
                )}
              </button>
            </form>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <span className="text-5xl">✅</span>
              </div>
              <h3 className="text-3xl font-semibold text-emerald-700">Attendance Confirmed</h3>
              <p className="text-slate-600 mt-3 text-lg">Thank you for joining the session.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}