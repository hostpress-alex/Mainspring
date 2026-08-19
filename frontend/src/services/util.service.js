import {t} from '../i18n'
import {formatClock} from './time.service.js';
export const utilService = {
    makeId,
    makeLorem,
    getRandomIntInclusive,
    debounce,
    saveToStorage,
    loadFromStorage,
    getMonthName,
    getColors,
    getRandomColor,
    calculateTime,
    calculateTimeWithBefore,
    getFormattedDate
}

function makeId(length = 6){
    var txt = ''
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

    for(var i = 0; i < length; i++){
        txt += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return txt
}

function makeLorem(size = 100){
    var words = ['The sky', 'above', 'the port', 'was', 'the color of television', 'tuned', 'to', 'a dead channel', '.', 'All', 'this happened', 'more or less', '.', 'I', 'had', 'the story', 'bit by bit', 'from various people', 'and', 'as generally', 'happens', 'in such cases', 'each time', 'it', 'was', 'a different story', '.', 'It', 'was', 'a pleasure', 'to', 'burn']
    var txt = ''
    while(size > 0){
        size--
        txt += words[Math.floor(Math.random() * words.length)] + ' '
    }
    return txt
}

function getRandomIntInclusive(min, max){
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max - min + 1)) + min //The maximum is inclusive and the minimum is inclusive 
}

function debounce(func, timeout = 300){
    let timer
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
            func.apply(this, args)
        }, timeout)
    }
}

function getMonthName(date){
    const monthNames = ['Jan`', 'Feb`', 'March', 'April', 'May', 'June',
        'July', 'Aug`', 'Sep`', 'Oct`', 'Nov`', 'Dec`'
    ]
    return monthNames[date.getMonth()]
}

function saveToStorage(key, value){
    localStorage.setItem(key, JSON.stringify(value))
}

function loadFromStorage(key){
    const data = localStorage.getItem(key)
    return (data)?JSON.parse(data):undefined
}

function getColors(){
    return [
        '#a25ddc',
        '#FBBC04',
        '#F1E4DE',
        '#FDCFE8',
        '#F28B82',
        '#FFF475',
        '#CCFF90',
        '#CBF0F8',
        '#A7FFEB',
        '#D7AEFB',
        '#E6C9A8',
        '#E8EAED'
    ]
}

function getRandomColor(){
    let maxVal = 0xFFFFFF
    let randomNumber = Math.random() * maxVal
    randomNumber = Math.floor(randomNumber)
    randomNumber = randomNumber.toString(16)
    let randColor = randomNumber.padStart(6, 0)
    return `#${randColor.toUpperCase()}`
}

function calculateTime(time){
    const timeDiff = Math.floor((Date.now() - time) / 60000)
    if(timeDiff >= 60 * 24 * 7) return `${Math.floor(timeDiff / (60 * 24 * 7))} ${t('time.weekShort')}`
    if(timeDiff >= 60 * 24) return `${Math.floor(timeDiff / (60 * 24))} ${t('time.dayShort')}`
    if(timeDiff >= 60) return `${Math.floor(timeDiff / 60)} ${t('time.hourShort')}`
    if(timeDiff >= 2) return `${timeDiff} ${t('time.minuteShort')}`
    return t('time.justNow')
}

function calculateTimeWithBefore(time){
    var timeReturn = '';
    const timeDiff = Math.floor((Date.now() - time) / 60000)
    if(timeDiff >= 60 * 24 * 7) timeReturn =  `1${Math.floor(timeDiff / (60 * 24 * 7))} ${t('time.weekShort')}`
    if(timeDiff >= 60 * 24) timeReturn =  `2${Math.floor(timeDiff / (60 * 24))} ${t('time.dayShort')}`
    if(timeDiff >= 60) timeReturn =  `3${Math.floor(timeDiff / 60)} ${t('time.hourShort')}`
    if(timeDiff >= 2) timeReturn =  `4` + timeDiff + ` ${t('time.minuteShort')}`
    else return t('time.justNow')

    return `${t('time.beforeTime', {time: timeReturn})}`;
}

function getFormattedDate(timestamp){
    const date = new Date(timestamp)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()

    return `${day}/${month}/${year}`
}