import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // WebView edge-to-edge : pas de safe area en haut
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }
}
