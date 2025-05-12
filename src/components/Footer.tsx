'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// A simple SVG for an external link icon
const ExternalLinkIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lucide lucide-external-link ml-1"
        aria-hidden="true"
    >
        <path d="M15 3h6v6"></path>
        <path d="M10 14 21 3"></path>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
    </svg>
);

export const Footer: React.FC = () => {
    const { t } = useTranslation();
    const [isMounted, setIsMounted] = useState(false);
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

    useEffect(() => {
        setIsMounted(true);
        setCurrentYear(new Date().getFullYear()); // Ensure year is set on client
    }, []);

    const footerSections = [
        {
            title: 'Resources',
            links: [
                { name: 'Docs', href: '#', external: true }, // Replace # with actual links
                { name: 'GitHub', href: '#', external: true },
            ],
        },
        {
            title: 'Legal',
            links: [
                { name: 'Terms of Service', href: '#', external: false },
                { name: 'Privacy Policy', href: '#', external: false },
            ],
        },
        {
            title: 'Community',
            links: [
                { name: 'Twitter / X', href: '#', external: true },
                { name: 'Discord', href: '#', external: true },
            ],
        },
    ];

    return (
        <footer className="bg-gray-800 text-gray-300 border-t border-gray-700">
            <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="py-12 md:flex md:items-start md:justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-12 mb-8 md:mb-0 flex-1">
                        {footerSections.map((section) => (
                            <div key={section.title}>
                                <h3 className="text-sm font-semibold uppercase text-gray-400 tracking-wider">
                                    {section.title}
                                </h3>
                                <ul role="list" className="mt-4 space-y-2">
                                    {section.links.map((link) => (
                                        <li key={link.name}>
                                            <a
                                                href={link.href}
                                                className="text-base text-gray-300 hover:text-white flex items-center"
                                                target={link.external ? '_blank' : undefined}
                                                rel={link.external ? 'noopener noreferrer' : undefined}
                                            >
                                                {link.name}
                                                {link.external && <ExternalLinkIcon />}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="text-left md:text-right text-sm text-gray-400 mt-8 md:mt-0 md:ml-8 shrink-0">
                        <p>{isMounted ? t('footer.copyright', { year: currentYear }) : `© ${new Date().getFullYear()} wLiquify. All rights reserved.`}</p>
                        <p className="mt-1">{isMounted ? t('footer.disclaimer') : 'Disclaimer: This is a software project. Use at your own risk.'}</p>
                    </div>
                </div>
                <div className="py-8 text-center text-xs text-gray-500 border-t border-gray-700 mt-8">
                    <p>{isMounted ? t('footer.financialDisclaimer') : 'wLiquify is not a financial advisor. All information provided is for educational and informational purposes only.'}</p>
                </div>
            </div>
        </footer>
    );
};

Footer.displayName = 'Footer'; 