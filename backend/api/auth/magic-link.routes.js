const express = require('express')
const crypto = require('crypto')
const { sendMagicLink, validateMagicLink, createOrFindUser } = require('./magic-link.service')

const router = express.Router()

// Send magic link to email
router.post('/send', async (req, res) => {
    try {
        const { email } = req.body
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' })
        }

        // Generate a secure token
        const token = crypto.randomBytes(32).toString('hex')
        
        // Store token temporarily (in production, use Redis or database)
        const tokenData = {
            email,
            token,
            expires: Date.now() + (15 * 60 * 1000) // 15 minutes
        }
        
        // For local development, we'll store in memory (not recommended for production)
        global.magicLinkTokens = global.magicLinkTokens || new Map()
        global.magicLinkTokens.set(token, tokenData)
        
        // In a real application, you'd send an email here
        // For local development, we'll log the magic link to console
        const magicLink = `http://localhost:3000/auth/login?token=${token}`
        
        console.log('\n' + '='.repeat(50))
        console.log('🪄 MAGIC LINK GENERATED')
        console.log('='.repeat(50))
        console.log(`Email: ${email}`)
        console.log(`Magic Link: ${magicLink}`)
        console.log(`Expires: ${new Date(tokenData.expires)}`)
        console.log('='.repeat(50) + '\n')
        
        // Simulate email sending
        await sendMagicLink(email, magicLink)
        
        res.json({ 
            success: true, 
            message: 'Magic link sent to your email',
            // For local development only - remove in production
            magicLink: process.env.NODE_ENV === 'development' ? magicLink : undefined
        })
        
    } catch (error) {
        console.error('Error sending magic link:', error)
        res.status(500).json({ error: 'Failed to send magic link' })
    }
})

// Verify magic link token
router.post('/verify', async (req, res) => {
    try {
        const { token } = req.body
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' })
        }

        // Check if token exists and is valid
        global.magicLinkTokens = global.magicLinkTokens || new Map()
        const tokenData = global.magicLinkTokens.get(token)
        
        if (!tokenData) {
            return res.status(400).json({ error: 'Invalid token' })
        }
        
        if (Date.now() > tokenData.expires) {
            global.magicLinkTokens.delete(token)
            return res.status(400).json({ error: 'Token expired' })
        }
        
        // Token is valid, create or find user
        const user = await createOrFindUser(tokenData.email)
        
        // Clean up token
        global.magicLinkTokens.delete(token)
        
        res.json({
            success: true,
            user: {
                username: user.username,
                fullname: user.fullname,
                email: user.email
            }
        })
        
    } catch (error) {
        console.error('Error verifying magic link:', error)
        res.status(500).json({ error: 'Failed to verify magic link' })
    }
})

module.exports = router