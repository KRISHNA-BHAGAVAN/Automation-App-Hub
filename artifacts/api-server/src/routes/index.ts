import { Router, type IRouter } from "express";
import healthRouter from "./health";
import passwordResetRouter from "./password-reset";
import userInviteRouter from "./user-invite";

const router: IRouter = Router();

router.use(healthRouter);
router.use(passwordResetRouter);
router.use(userInviteRouter);

export default router;
