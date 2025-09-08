const userService = require('../user/user.service')
const logger = require('../../services/logger.service')

async function sendMagicLink(email, magicLink) {
    // For local development, we'll just log to console
    // In production, integrate with email service like SendGrid, Mailgun, etc.
    
    logger.info(`Magic link sent to ${email}: ${magicLink}`)
    
    // Simulate email delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return true
}

async function validateMagicLink(token) {
    // This would typically validate against database or cache
    // Implementation depends on your token storage strategy
    return true
}

async function createOrFindUser(email) {
    try {
        // First try to find existing user by email (as username)
        let user = await userService.getByUsername(email)
        
        if (!user) {
            // Create new user with email as username
            const newUser = {
                username: email,
                email: email,
                fullname: email.split('@')[0], // Use email prefix as default fullname
                password: 'magic-link', // Placeholder password for magic link users
                imgUrl: `https://ui-avatars.com/api/?name=${email.split('@')[0]}&background=0D8ABC&color=fff`
            }
            
            user = await userService.add(newUser)
            logger.info(`New user created via magic link: ${email}`)
        } else {
            logger.info(`Existing user logged in via magic link: ${email}`)
        }
        
        return user
        
    } catch (error) {
        logger.error('Error creating/finding user:', error)
        throw error
    }
}

module.exports = {
    sendMagicLink,
    validateMagicLink,
    createOrFindUser
}