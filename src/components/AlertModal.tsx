'use client';

import React, { Fragment } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { Dialog, Transition } from '@headlessui/react';
import { useTranslation } from 'react-i18next';

export const AlertModal: React.FC = () => {
    const {
        isAlertModalOpen,
        alertModalMessage,
        closeAlertModal
    } = useSettings();
    const { t } = useTranslation();

    if (!isAlertModalOpen) {
        return null;
    }

    return (
        <Transition appear show={isAlertModalOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[100]" onClose={closeAlertModal}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title
                                    as="h3"
                                    className="text-lg font-medium leading-6 text-white"
                                >
                                    {t('alertModal.title')}
                                </Dialog.Title>
                                <div className="mt-3">
                                    <p className="text-sm text-gray-300">
                                        {alertModalMessage}
                                    </p>
                                </div>

                                <div className="mt-5 sm:mt-6">
                                    <button
                                        type="button"
                                        className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 sm:text-sm"
                                        onClick={closeAlertModal}
                                    >
                                        {t('alertModal.okButton')}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

AlertModal.displayName = 'AlertModal'; 