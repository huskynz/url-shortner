'use client';

import React, { useState } from 'react';

import '~/styles/fonts/brands.css';
import '~/styles/fonts/skeleton-dark.css';
import '~/styles/globals.css';

interface Link {
  name: string;
  icon: string;
  url: string;
  buttonClass: string;
}

const Page: React.FC = () => {
  const [dark, setDark] = useState(false);

  const links: Link[] = [
    {
      name: 'Main Website',
      icon: 'generic-website',
      url: '/m',
      buttonClass: 'button-default',
    },
    {
      name: 'Blog',
      icon: 'blog',
      url: '/blog',
      buttonClass: 'button-default',
    },
    {
      name: 'Email',
      icon: 'email',
      url: '/email',
      buttonClass: 'button-default',
    },
    {
      name: 'This site\'s code',
      icon: 'generic-code',
      url: '/gurl',
      buttonClass: 'button-github',
    },
    {
      name: 'GitHub',
      icon: 'github',
      url: '/github',
      buttonClass: 'button-github',
    },
    {
      name: 'Twitch',
      icon: 'twitch',
      url: '/twitch',
      buttonClass: 'button-twitch',
    },
    {
      name: 'YouTube',
      icon: 'youtube',
      url: '/youtube',
      buttonClass: 'button-yt',
    },
  ];

  return (
    <div
      style={
        dark
          ? {
              color: '#FFFFFF',
              backgroundColor: '#292929',
              minHeight: '100vh',
              padding: '20px',
            }
          : {
              color: '#FFFFFF',
              backgroundColor: '#292929',
              minHeight: '100vh',
              padding: '20px',
            }
      }
    >
      <div className="container">
        <div className="row">
          <div className="column" style={{ paddingTop: '10%' }}>
            <center>
              <img
                src="//serv.husky.nz/logo/default180.png"
                alt="Logo"
              />
              <h1>HuskyNZ</h1>
            </center>
            <p>You can find us on the following platforms:</p>
            <br />
            <a href="/urls">View all shortened urls</a>
            <center>
              <br />
              {links.map((link, index) => (
                <React.Fragment key={index}>
                  <a
                    className={`button ${link.buttonClass}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <center>
                      <img
                        className="icon"
                        src={`https://serv.husky.nz/urlicons/${link.icon}.svg`}
                        alt={`${link.name} Logo`}
                        width={900}
                        height={900}
                      />
                    </center>
                    {link.name}
                  </a>
                  <br />
                </React.Fragment>
              ))}
            </center>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;