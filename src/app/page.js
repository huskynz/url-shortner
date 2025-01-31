'use client'
import React, { useState } from "react";
import { signIn } from "next-auth/react";



const Page = () => {
  const [dark, setDark] = useState(true);
  
  const links = [
    {
      name: "Main Website",
      icon: "https://serv.husky.nz/logo/default180.png",
      url: "/m",
      buttonClass: "bg-gray-800 hover:bg-gray-700"
  },
  {
    name: "View all shortened urls",
    icon: "https://serv.husky.nz/urlicons/generic-website.svg",
    url: "/urls",
    buttonClass: "bg-[#025436] hover:bg-[#1b1f23]"
  },
    {
      name: "Twitch",
      icon: "https://serv.husky.nz/urlicons/twitch.svg",
      url: "/twitch",
      buttonClass: "bg-[#6441a5] hover:bg-[#553a8e]"
    },
    {
      name: "YouTube",
      icon: "https://serv.husky.nz/urlicons/youtube.svg",
      url: "/youtube",
      buttonClass: "bg-[#8a0000] hover:bg-[#cc0000]"
    },
    {
      name: "GitHub",
      icon: "https://serv.husky.nz/urlicons/github.svg",
      url: "/github",
      buttonClass: "bg-[#24292e] hover:bg-[#1b1f23]"
    },
    {
      name: "Email",
      icon: "https://serv.husky.nz/urlicons/email.svg",
      url: "mailto:mail@husky.nz",
      buttonClass: "bg-gray-800 hover:bg-gray-700"
    },
    {
      name: "This sites code",
      icon: "https://serv.husky.nz/urlicons/generic-code.svg",
      url: "/gurl",
      buttonClass: "bg-[#24292e] hover:bg-[#1b1f23]"
    }
];

return (
  <div style={dark ? {
    color: "#FFFFFF",
    backgroundColor: "#000000",
    minHeight: "100vh"
  } : {}}>
    {/* Full-width nav */}
    <div className="w-full px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img 
            src="https://serv.husky.nz/logo/default180.png" 
            width={50} 
            height={50} 
            alt="Logo"
            className="rounded"
          />
          <div>
            <h1 className="text-2xl font-bold">HuskyNZ URL Shortner</h1>
            <p className="text-gray-400">
              Version: {process.env.NEXT_PUBLIC_Version_Number} | Environment:{" "}
              <span className={`${process.env.NEXT_PUBLIC_ENV === "Development" ? "uppercase text-red-500" : "text-green-400"}`}>
                {process.env.NEXT_PUBLIC_ENV}
              </span>
            </p>
          </div>
        </div>
        
      </div>
    </div>

     {/* Platforms Section */}
     <div className="flex-1 max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center">
          <p className="text-center mb-4 font-bold text-2xl">
            You can find us on the following platforms
          </p>
          
          <div className="w-full flex flex-col items-center gap-4">
            {links.map((link, index) => (
              <a 
                key={index}
                className={`${link.buttonClass} flex items-center justify-center w-full max-w-md p-4 rounded-lg transition-all hover:scale-105`}
                href={link.url} 
                target="_blank" 
                rel="noreferrer"
              >
                <img 
                  className="w-12 h-12 mr-3"
                  src={`${link.icon}`} 
                  alt={`${link.name} Logo`} 
                  width={48}
                  height={48}
                />
                <span className="text-white text-lg">{link.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center text-gray-500 p-4">
        <p>© 2025 HuskyNZ. Licensed under the MIT open source lisense <a className='text-white underline' href='https://raw.githubusercontent.com/huskynz/url-shortner/refs/heads/master/LICENSE'>here</a> | You can view this sites source code <a href='/ghm' className='text-white underline'>here</a></p>
        <p>By using this site you agree to HuskyNZ's <a href='https://legal.husky.nz/toc' className='text-white underline'>Terms of use</a> and <a href='https://legal.husky.nz/Privacy-Policy' className='text-white underline'>Privacy policy</a></p>
      </footer>
    </div>
);
};
export default Page;