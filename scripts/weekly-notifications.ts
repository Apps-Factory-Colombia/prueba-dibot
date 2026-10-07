import 'dotenv/config'
import { runWeeklyNotifications } from '../api/notifications.js'

const result = await runWeeklyNotifications()
console.log(JSON.stringify(result))
