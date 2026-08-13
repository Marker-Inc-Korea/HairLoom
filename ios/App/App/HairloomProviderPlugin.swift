import Capacitor
import CryptoKit
import Foundation
import ImageIO
import Security
import SQLite3
import UIKit

@objc(HairloomBridgeViewController)
final class HairloomBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HairloomProviderPlugin())
    }
}

@objc(HairloomProviderPlugin)
final class HairloomProviderPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "HairloomProviderPlugin"
    let jsName = "HairloomProvider"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runAnalysis", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "batchStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readOutput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteCustomerData", returnType: CAPPluginReturnPromise)
    ]

    private var engine: HairloomProviderEngine!

    override func load() {
        engine = HairloomProviderEngine { [weak self] event in
            DispatchQueue.main.async { self?.notifyListeners("batchEvent", data: event, retainUntilConsumed: true) }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["available": true, "configured": HairloomKeychain.hasSecret, "provider": "OpenAI Image API", "model": HairloomProviderEngine.model])
    }

    @objc func configure(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let configured = HairloomKeychain.hasSecret
            let alert = UIAlertController(title: configured ? "API 키 변경" : "API 키 입력", message: "별도 과금 OpenAI API 키를 입력하세요. 키는 iOS Keychain에만 저장되고 웹 화면·브라우저 저장소·로그에는 전달되지 않습니다.", preferredStyle: .alert)
            alert.addTextField { field in
                field.placeholder = "sk-..."
                field.isSecureTextEntry = true
                field.textContentType = nil
                field.keyboardType = .asciiCapable
                field.autocapitalizationType = .none
                field.autocorrectionType = .no
            }
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in call.reject("cancelled") })
            alert.addAction(UIAlertAction(title: configured ? "변경" : "저장", style: .default) { _ in
                guard let key = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines), key.count >= 20 else {
                    call.reject("API 키를 확인해주세요.")
                    return
                }
                do {
                    try HairloomKeychain.write(key)
                    call.resolve(["configured": true, "provider": "OpenAI Image API", "model": HairloomProviderEngine.model])
                    self.engine.resumeAll()
                } catch {
                    call.reject("보안 저장소에 연결 정보를 저장하지 못했습니다.")
                }
            })
            self.bridge?.viewController?.present(alert, animated: true)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        HairloomKeychain.clear()
        engine.clearProviderCredential()
        call.resolve()
    }

    @objc func createSource(_ call: CAPPluginCall) {
        engine.createSource(call)
    }

    @objc func deleteSource(_ call: CAPPluginCall) {
        engine.deleteSource(call)
    }

    @objc func readSource(_ call: CAPPluginCall) {
        engine.readSource(call)
    }

    @objc func runAnalysis(_ call: CAPPluginCall) {
        engine.runAnalysis(call)
    }

    @objc func createBatch(_ call: CAPPluginCall) {
        engine.createBatch(call)
    }

    @objc func batchStatus(_ call: CAPPluginCall) {
        engine.batchStatus(call)
    }

    @objc func cancelBatch(_ call: CAPPluginCall) {
        engine.cancelBatch(call)
    }

    @objc func readOutput(_ call: CAPPluginCall) {
        engine.readOutput(call)
    }

    @objc func deleteCustomerData(_ call: CAPPluginCall) {
        engine.deleteCustomerData(call)
    }
}

private enum HairloomKeychain {
    private static let service = "com.markerinc.hairloom.image-provider"
    private static let account = "openai-image-api-key"

    static var hasSecret: Bool { (try? read()) != nil }

    static func write(_ value: String) throws {
        clear()
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: data
        ]
        guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw HairloomNativeError("keychain-write") }
    }

    static func read() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else { throw HairloomNativeError("keychain-read") }
        return value
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private final class HairloomProviderEngine: NSObject, URLSessionTaskDelegate {
    static let model = "gpt-image-2"
    private static let endpoint = URL(string: "https://api.openai.com/v1/images/edits")!
    private static let analysisEndpoint = URL(string: "https://api.openai.com/v1/responses")!
    private static let analysisModel = "gpt-4.1-mini"
    private static let analysisLimit = 1024 * 1024
    private static let sourceLimit = 15 * 1024 * 1024
    private static let outputLimit = 24 * 1024 * 1024
    private static let customerDataTTL: TimeInterval = 7 * 24 * 60 * 60
    private let queue = DispatchQueue(label: "com.markerinc.hairloom.provider")
    private let callback: ([String: Any]) -> Void
    private let journal: HairloomJournal
    private let root: URL
    private var tasks: [String: URLSessionDataTask] = [:]
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 180
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    init(callback: @escaping ([String: Any]) -> Void) {
        self.callback = callback
        let applicationSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        root = applicationSupport.appendingPathComponent("HairloomPrivate", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try? Self.protect(root)
        for directory in ["sources", "outputs", "jobs"] {
            let url = root.appendingPathComponent(directory, isDirectory: true)
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try? Self.protect(url)
        }
        journal = HairloomJournal(url: root.appendingPathComponent("hairloom-private.sqlite"))
        super.init()
        journal.recoverInterrupted()
        journal.cleanupExpired(before: Date().timeIntervalSince1970 - Self.customerDataTTL)
        cleanupPrivateFiles()
        resumeAll()
    }

    func createSource(_ call: CAPPluginCall) {
        queue.async {
            do {
                let request = try call.decode(SourceRequest.self)
                guard ["front", "side", "back", "crown", "nape", "detail"].contains(request.viewKey), request.sourceHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, ["image/jpeg", "image/png", "image/webp"].contains(request.mimeType), let data = Data(base64Encoded: request.base64), data.count >= 32, data.count <= Self.sourceLimit, Self.mime(data) == request.mimeType, Self.validDimensions(data), Self.hash(data) == request.sourceHash else { throw HairloomNativeError("invalid-source") }
                let sourceId = Self.opaque("source")
                let suffix = request.mimeType == "image/png" ? ".png" : request.mimeType == "image/webp" ? ".webp" : ".jpg"
                let file = self.root.appendingPathComponent("sources/\(sourceId)\(suffix)")
                try Self.write(data, to: file)
                try self.journal.insertSource(id: sourceId, hash: request.sourceHash, view: request.viewKey, mime: request.mimeType, fileName: file.lastPathComponent)
                call.resolve(["sourceId": sourceId, "sourceHash": request.sourceHash, "bytes": data.count])
            } catch let error as HairloomNativeError {
                call.reject(error.code)
            } catch {
                call.reject("source-storage")
            }
        }
    }

    func deleteSource(_ call: CAPPluginCall) {
        queue.async {
            do {
                let id = try Self.validTypedId(call.getString("sourceId"), prefix: "source")
                guard !self.journal.sourceInUse(id) else { throw HairloomNativeError("source-in-use") }
                if let source = self.journal.source(id) { try? FileManager.default.removeItem(at: self.root.appendingPathComponent("sources/\(source.fileName)")) }
                self.journal.deleteSource(id)
                call.resolve()
            } catch let error as HairloomNativeError { call.reject(error.code) }
            catch { call.reject("source-delete") }
        }
    }

    func readSource(_ call: CAPPluginCall) {
        queue.async {
            do {
                let id = try Self.validTypedId(call.getString("sourceId"), prefix: "source")
                guard let source = self.journal.source(id) else { throw HairloomNativeError("source-not-found") }
                let data = try Self.read(self.root.appendingPathComponent("sources/\(source.fileName)"), limit: Self.sourceLimit)
                call.resolve(["sourceId": id, "sourceHash": source.hash, "viewKey": source.view, "mimeType": source.mime, "bytes": data.count, "dataUrl": "data:\(source.mime);base64,\(data.base64EncodedString())"])
            } catch let error as HairloomNativeError { call.reject(error.code) }
            catch { call.reject("source-read") }
        }
    }

    func runAnalysis(_ call: CAPPluginCall) {
        queue.async {
            do {
                let request = try call.decode(AnalysisRequest.self)
                try request.validate()
                guard let source = self.journal.source(request.sourceId), source.hash == request.sourceHash else { throw HairloomNativeError("source-ownership") }
                let sourceData = try Self.read(self.root.appendingPathComponent("sources/\(source.fileName)"), limit: Self.sourceLimit)
                guard let apiKey = try HairloomKeychain.read(), apiKey.count >= 20 else { throw HairloomNativeError("not-configured") }
                let content: [[String: Any]] = [
                    ["type": "input_text", "text": Self.hairAnalysisPrompt(request.freePrompt)],
                    ["type": "input_image", "image_url": "data:\(source.mime);base64,\(sourceData.base64EncodedString())"]
                ]
                let body: [String: Any] = ["model": Self.analysisModel, "input": [["role": "user", "content": content]]]
                var urlRequest = URLRequest(url: Self.analysisEndpoint)
                urlRequest.httpMethod = "POST"
                urlRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
                urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)
                let key = "analysis:\(UUID().uuidString)"
                let task = self.session.dataTask(with: urlRequest) { data, response, error in
                    self.queue.async {
                        self.tasks.removeValue(forKey: key)
                        do {
                            if let error = error as? URLError, error.code == .cancelled { throw HairloomNativeError("cancelled") }
                            if error != nil { throw HairloomNativeError("network") }
                            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                            if status == 401 || status == 403 { throw HairloomNativeError("unauthorized") }
                            if status == 429 { throw HairloomNativeError("rate-limited") }
                            guard (200..<300).contains(status), let data, data.count <= Self.analysisLimit else { throw HairloomNativeError(status >= 500 ? "provider-unavailable" : "analysis-provider") }
                            call.resolve(try Self.analysisResult(data))
                        } catch let error as HairloomNativeError {
                            call.reject(error.code)
                        } catch {
                            call.reject("invalid-analysis-output")
                        }
                    }
                }
                self.tasks[key] = task
                task.resume()
            } catch let error as HairloomNativeError {
                call.reject(error.code)
            } catch {
                call.reject("analysis-provider")
            }
        }
    }

    func createBatch(_ call: CAPPluginCall) {
        queue.async {
            do {
                guard HairloomKeychain.hasSecret else { throw HairloomNativeError("not-configured") }
                let request = try call.decode(BatchRequest.self)
                let context = call.getObject("context", [:])
                try Self.validateContext(context, depth: 0)
                try request.validate()
                for slot in request.slots {
                    guard let source = self.journal.source(slot.sourceId), source.hash == slot.sourceHash else { throw HairloomNativeError("source-ownership") }
                }
                let jobs = self.root.appendingPathComponent("jobs/\(request.batchId)", isDirectory: true)
                try FileManager.default.createDirectory(at: jobs, withIntermediateDirectories: true)
                try Self.protect(jobs)
                do {
                    let contextData = try JSONSerialization.data(withJSONObject: context)
                    try Self.write(contextData, to: jobs.appendingPathComponent("context.json"))
                    for slot in request.slots {
                        let payload = try JSONEncoder().encode(JobPayload(sourceId: slot.sourceId, sourceHash: slot.sourceHash, prompt: slot.prompt))
                        try Self.write(payload, to: jobs.appendingPathComponent("\(slot.slotIndex).json"))
                    }
                    try self.journal.createBatch(request)
                } catch {
                    try? FileManager.default.removeItem(at: jobs)
                    throw error
                }
                for slot in request.slots { self.callback(self.journal.event(request.batchId, slot: slot, status: "queued", outputId: nil, error: nil, statusCode: 0, attempts: 0)) }
                call.resolve(["batchId": request.batchId, "slotCount": 100])
                self.pump(request.batchId)
            } catch let error as HairloomNativeError { call.reject(error.code) }
            catch { call.reject("batch-storage") }
        }
    }

    func batchStatus(_ call: CAPPluginCall) {
        queue.async {
            do {
                let id = try Self.validId(call.getString("batchId"))
                guard var snapshot = self.journal.snapshot(id) else { throw HairloomNativeError("batch-not-found") }
                let contextURL = self.root.appendingPathComponent("jobs/\(id)/context.json")
                if FileManager.default.fileExists(atPath: contextURL.path) {
                    let contextData = try Self.read(contextURL, limit: 64 * 1024)
                    snapshot["context"] = try JSONSerialization.jsonObject(with: contextData)
                }
                call.resolve(snapshot)
            } catch let error as HairloomNativeError { call.reject(error.code) }
            catch { call.reject("batch-status") }
        }
    }

    func cancelBatch(_ call: CAPPluginCall) {
        queue.async {
            do {
                let id = try Self.validId(call.getString("batchId"))
                self.journal.cancelBatch(id)
                for key in self.tasks.keys where key.hasPrefix("\(id):") { self.tasks.removeValue(forKey: key)?.cancel() }
                call.resolve(self.journal.snapshot(id) ?? [:])
            } catch let error as HairloomNativeError { call.reject(error.code) }
            catch { call.reject("batch-cancel") }
        }
    }

    func readOutput(_ call: CAPPluginCall) {
        queue.async {
            do {
                let id = try Self.validTypedId(call.getString("outputId"), prefix: "output")
                guard let output = self.journal.output(id) else { throw HairloomNativeError("output-not-found") }
                let data = try Self.read(self.root.appendingPathComponent("outputs/\(output.fileName)"), limit: Self.outputLimit)
                call.resolve(["outputId": id, "mimeType": output.mime, "bytes": data.count, "dataUrl": "data:\(output.mime);base64,\(data.base64EncodedString())"])
            } catch let error as HairloomNativeError { call.reject(error.code) }
            catch { call.reject("output-read") }
        }
    }

    func deleteCustomerData(_ call: CAPPluginCall) {
        queue.async {
            self.tasks.values.forEach { $0.cancel() }
            self.tasks.removeAll()
            self.journal.clearCustomerData()
            for directory in ["sources", "outputs", "jobs"] {
                let url = self.root.appendingPathComponent(directory, isDirectory: true)
                try? FileManager.default.removeItem(at: url)
                try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                try? Self.protect(url)
            }
            call.resolve()
        }
    }

    func clearProviderCredential() {
        queue.async {
            self.journal.releaseForCredentialClear()
            self.tasks.values.forEach { $0.cancel() }
            self.tasks.removeAll()
        }
    }

    func resumeAll() {
        queue.async {
            guard HairloomKeychain.hasSecret else { return }
            self.journal.resumableBatches().forEach(self.pump)
        }
    }

    private func pump(_ batchId: String) {
        guard HairloomKeychain.hasSecret, !journal.batchCancelled(batchId) else { return }
        for slot in journal.queuedSlots(batchId, limit: max(0, 2 - tasks.count)) {
            let key = "\(batchId):\(slot.slotIndex)"
            guard tasks[key] == nil else { continue }
            do {
                let attempts = journal.markRunning(batchId, index: slot.slotIndex)
                guard HairloomKeychain.hasSecret else { self.journal.retry(batchId, index: slot.slotIndex); return }
                callback(journal.event(batchId, slot: slot.input, status: "running", outputId: nil, error: nil, statusCode: 0, attempts: attempts))
                let jobData = try Self.read(root.appendingPathComponent("jobs/\(batchId)/\(slot.slotIndex).json"), limit: 64 * 1024)
                let job = try JSONDecoder().decode(JobPayload.self, from: jobData)
                guard let source = journal.source(job.sourceId), source.hash == job.sourceHash, let apiKey = try HairloomKeychain.read() else { throw HairloomNativeError("source-ownership") }
                let sourceData = try Self.read(root.appendingPathComponent("sources/\(source.fileName)"), limit: Self.sourceLimit)
                var request = URLRequest(url: Self.endpoint)
                request.httpMethod = "POST"
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                let multipart = Self.multipart(source: sourceData, mime: source.mime, prompt: job.prompt)
                request.setValue("multipart/form-data; boundary=\(multipart.boundary)", forHTTPHeaderField: "Content-Type")
                request.httpBody = multipart.data
                let task = session.dataTask(with: request) { data, response, error in
                    self.queue.async { self.finish(slot: slot, key: key, data: data, response: response, error: error) }
                }
                tasks[key] = task
                task.resume()
            } catch let error as HairloomNativeError {
                if journal.batchCancelled(batchId) { return }
                if !HairloomKeychain.hasSecret || !journal.slotRunning(batchId, index: slot.slotIndex) { journal.retry(batchId, index: slot.slotIndex); return }
                journal.fail(batchId, index: slot.slotIndex, error: error.code)
                callback(journal.event(batchId, slot: slot.input, status: "failed", outputId: nil, error: error.code, statusCode: 0, attempts: journal.attempts(batchId, index: slot.slotIndex)))
                pump(batchId)
            } catch {
                if journal.batchCancelled(batchId) { return }
                if !HairloomKeychain.hasSecret || !journal.slotRunning(batchId, index: slot.slotIndex) { journal.retry(batchId, index: slot.slotIndex); return }
                journal.fail(batchId, index: slot.slotIndex, error: "native-provider")
                callback(journal.event(batchId, slot: slot.input, status: "failed", outputId: nil, error: "native-provider", statusCode: 0, attempts: journal.attempts(batchId, index: slot.slotIndex)))
                pump(batchId)
            }
        }
    }

    private func finish(slot: SlotRow, key: String, data: Data?, response: URLResponse?, error: Error?) {
        tasks.removeValue(forKey: key)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        let attempts = journal.attempts(slot.batchId, index: slot.slotIndex)
        if journal.batchCancelled(slot.batchId) { pump(slot.batchId); return }
        if !HairloomKeychain.hasSecret || !journal.slotRunning(slot.batchId, index: slot.slotIndex) { journal.retry(slot.batchId, index: slot.slotIndex); pump(slot.batchId); return }
        do {
            if error != nil { throw ProviderFailure(code: "network", statusCode: 0, pressure: true) }
            guard (200..<300).contains(statusCode), let data, data.count <= 4 * 1024 * 1024 else {
                throw ProviderFailure(code: "http-\(statusCode)", statusCode: statusCode, pressure: [429, 500, 502, 503, 504].contains(statusCode))
            }
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let items = payload?["data"] as? [[String: Any]]
            guard items?.count == 1, let encoded = items?.first?["b64_json"] as? String, let outputData = Data(base64Encoded: encoded), outputData.count <= Self.outputLimit, Self.mime(outputData) == "image/jpeg", Self.validDimensions(outputData) else { throw HairloomNativeError("invalid-output") }
            let mime = "image/jpeg"
            let outputId = Self.opaque("output")
            let fileName = outputId + (mime == "image/png" ? ".png" : ".jpg")
            try Self.write(outputData, to: root.appendingPathComponent("outputs/\(fileName)"))
            journal.complete(slot.batchId, index: slot.slotIndex, outputId: outputId, mime: mime, fileName: fileName, bytes: outputData.count)
            callback(journal.event(slot.batchId, slot: slot.input, status: "done", outputId: outputId, error: nil, statusCode: 200, attempts: attempts))
        } catch let failure as ProviderFailure {
            if failure.pressure && attempts < 2 {
                journal.retry(slot.batchId, index: slot.slotIndex)
                callback(journal.event(slot.batchId, slot: slot.input, status: "retryable", outputId: nil, error: "retryable", statusCode: failure.statusCode, attempts: attempts))
                queue.asyncAfter(deadline: .now() + min(120, 30 * Double(max(1, attempts)))) { self.pump(slot.batchId) }
                return
            } else {
                journal.fail(slot.batchId, index: slot.slotIndex, error: failure.code)
                callback(journal.event(slot.batchId, slot: slot.input, status: "failed", outputId: nil, error: failure.code, statusCode: failure.statusCode, attempts: attempts))
            }
        } catch let failure as HairloomNativeError {
            journal.fail(slot.batchId, index: slot.slotIndex, error: failure.code)
            callback(journal.event(slot.batchId, slot: slot.input, status: "failed", outputId: nil, error: failure.code, statusCode: statusCode, attempts: attempts))
        } catch {
            journal.fail(slot.batchId, index: slot.slotIndex, error: "native-provider")
            callback(journal.event(slot.batchId, slot: slot.input, status: "failed", outputId: nil, error: "native-provider", statusCode: statusCode, attempts: attempts))
        }
        pump(slot.batchId)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url?.scheme == "https" && request.url?.host == "api.openai.com" ? request : nil)
    }

    private static func hairAnalysisPrompt(_ freePrompt: String) -> String {
        let request = freePrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "현재 헤어를 유지하면서 어울리는 스타일을 폭넓게 추천" : freePrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        return [
            "Analyze only the visible hair in the single original customer photo.",
            "Never infer or describe identity, age, ethnicity, face shape, body, health, or gender identity.",
            "catalogLine means haircut geometry only: F for softer connected curves, M for directional barber-like planes, U when neutral or uncertain.",
            "Do not claim chemical history, bleach count, perm timing, extensions, or hidden scalp condition from pixels. Use null and add an uncertainty when not stated in the user request.",
            "Return JSON only with: catalogLine, currentLength (0..4), actualLengthCm, naturalTexture (straight|wavy|curly|coily), density (low|normal|high), damage (low|medium|high visible appearance only), currentToneId, targetToneIds, colorIntensity (subtle|balanced|vivid), similarity (0..4), confidence (0..1), uncertainties, summaryKo.",
            "USER REQUEST: \(request)"
        ].joined(separator: "\n")
    }

    private static func analysisResult(_ data: Data) throws -> [String: Any] {
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any], let text = analysisText(payload), let start = text.firstIndex(of: "{"), let end = text.lastIndex(of: "}"), start < end, let raw = try JSONSerialization.jsonObject(with: Data(text[start...end].utf8)) as? [String: Any] else { throw HairloomNativeError("invalid-analysis-output") }
        var result: [String: Any] = [:]
        for key in ["catalogLine", "naturalTexture", "density", "damage", "currentToneId", "colorIntensity", "summaryKo"] {
            guard let value = raw[key], !(value is NSNull) else { continue }
            guard let string = value as? String else { throw HairloomNativeError("invalid-analysis-output") }
            let maximum = key == "summaryKo" ? 180 : 80
            guard string.count <= maximum else { throw HairloomNativeError("invalid-analysis-output") }
            result[key] = string.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        for key in ["currentLength", "actualLengthCm", "similarity", "confidence"] {
            guard let value = raw[key], !(value is NSNull) else { continue }
            guard let number = value as? NSNumber else { throw HairloomNativeError("invalid-analysis-output") }
            result[key] = number
        }
        for key in ["targetToneIds", "uncertainties"] {
            guard let value = raw[key], !(value is NSNull) else { continue }
            guard let items = value as? [Any], items.count <= 16 else { throw HairloomNativeError("invalid-analysis-output") }
            result[key] = try items.map { item -> String in
                guard let string = item as? String, string.count <= 160 else { throw HairloomNativeError("invalid-analysis-output") }
                return string.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        guard !result.isEmpty else { throw HairloomNativeError("invalid-analysis-output") }
        return result
    }

    private static func analysisText(_ payload: [String: Any]) -> String? {
        if let direct = payload["output_text"] as? String, !direct.isEmpty { return direct }
        guard let output = payload["output"] as? [[String: Any]] else { return nil }
        for item in output {
            guard let content = item["content"] as? [[String: Any]] else { continue }
            if let text = content.compactMap({ $0["text"] as? String }).first(where: { !$0.isEmpty }) { return text }
        }
        return nil
    }

    private static func multipart(source: Data, mime: String, prompt: String) -> (boundary: String, data: Data) {
        let boundary = "Hairloom\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        field("model", model)
        field("prompt", prompt)
        field("size", "1024x1024")
        field("quality", "low")
        field("output_format", "jpeg")
        field("output_compression", "70")
        let sourceExtension = mime == "image/png" ? "png" : mime == "image/webp" ? "webp" : "jpg"
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"image\"; filename=\"prepared-original.\(sourceExtension)\"\r\nContent-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(source)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return (boundary, body)
    }

    private static func validateContext(_ value: Any, depth: Int) throws {
        guard depth <= 6 else { throw HairloomNativeError("invalid-context") }
        if value is NSNull || value is Bool || value is NSNumber { return }
        if let string = value as? String {
            guard string.count <= 4000 else { throw HairloomNativeError("invalid-context") }
            return
        }
        if let array = value as? [Any] {
            guard array.count <= 100 else { throw HairloomNativeError("invalid-context") }
            try array.forEach { try validateContext($0, depth: depth + 1) }
            return
        }
        if let object = value as? [String: Any] {
            guard object.count <= 64 else { throw HairloomNativeError("invalid-context") }
            for (key, item) in object {
                guard key.range(of: "^(api[-_]?key|authorization|token|cookie|headers?|url|baseurl|path|command|authfile)$", options: [.regularExpression, .caseInsensitive]) == nil else { throw HairloomNativeError("invalid-context") }
                try validateContext(item, depth: depth + 1)
            }
            return
        }
        throw HairloomNativeError("invalid-context")
    }

    fileprivate static func validId(_ value: String?) throws -> String {
        guard let value, value.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$", options: .regularExpression) != nil else { throw HairloomNativeError("invalid-id") }
        return value
    }
    fileprivate static func validTypedId(_ value: String?, prefix: String) throws -> String {
        let value = try validId(value)
        guard value.hasPrefix("\(prefix)_") else { throw HairloomNativeError("invalid-\(prefix)-id") }
        return value
    }
    private static func opaque(_ prefix: String) -> String { "\(prefix)_\(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased())" }
    private static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private static func validDimensions(_ data: Data) -> Bool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? NSNumber, let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else { return false }
        return width.intValue >= 64 && height.intValue >= 64 && width.intValue <= 4096 && height.intValue <= 4096
    }
    private static func mime(_ data: Data) -> String? {
        let bytes = [UInt8](data.prefix(12))
        if bytes.count >= 3, bytes[0] == 0xff, bytes[1] == 0xd8, bytes[2] == 0xff { return "image/jpeg" }
        if bytes.count >= 4, bytes[0] == 0x89, bytes[1] == 0x50, bytes[2] == 0x4e, bytes[3] == 0x47 { return "image/png" }
        if bytes.count >= 12, String(bytes: bytes[0..<4], encoding: .ascii) == "RIFF", String(bytes: bytes[8..<12], encoding: .ascii) == "WEBP" { return "image/webp" }
        return nil
    }
    private func cleanupPrivateFiles() {
        let manager = FileManager.default
        for (directory, allowed) in [("sources", journal.sourceFileNames()), ("outputs", journal.outputFileNames())] {
            let url = root.appendingPathComponent(directory, isDirectory: true)
            for file in (try? manager.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? [] where !allowed.contains(file.lastPathComponent) { try? manager.removeItem(at: file) }
        }
        let jobs = root.appendingPathComponent("jobs", isDirectory: true)
        let batchIds = journal.batchIds()
        for directory in (try? manager.contentsOfDirectory(at: jobs, includingPropertiesForKeys: nil)) ?? [] where !batchIds.contains(directory.lastPathComponent) { try? manager.removeItem(at: directory) }
    }

    private static func write(_ data: Data, to url: URL) throws { try data.write(to: url, options: [.atomic, .completeFileProtection]); try protect(url) }
    private static func read(_ url: URL, limit: Int) throws -> Data { let data = try Data(contentsOf: url, options: .mappedIfSafe); guard data.count <= limit else { throw HairloomNativeError("payload-too-large") }; return data }
    private static func protect(_ url: URL) throws {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutable = url
        try mutable.setResourceValues(values)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
    }
}

private struct SourceRequest: Decodable { let viewKey: String; let sourceHash: String; let mimeType: String; let base64: String }
private struct AnalysisRequest: Decodable {
    let sourceId: String
    let sourceHash: String
    let freePrompt: String
    func validate() throws {
        _ = try HairloomProviderEngine.validTypedId(sourceId, prefix: "source")
        guard sourceHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, freePrompt.count <= 500 else { throw HairloomNativeError("invalid-analysis-request") }
    }
}

private struct BatchRequest: Codable {
    let batchId: String
    let sourcePhotoKey: String
    let slots: [SlotInput]
    func validate() throws {
        _ = try HairloomProviderEngine.validId(batchId)
        _ = try HairloomProviderEngine.validId(sourcePhotoKey)
        guard slots.count == 100, Set(slots.map(\.slotIndex)).count == 100 else { throw HairloomNativeError("invalid-slot-count") }
        try slots.forEach { try $0.validate() }
    }
}
private struct SlotInput: Codable {
    let slotIndex: Int; let designId: String; let generation: Int; let sourceId: String; let sourceHash: String; let sourceViewKey: String; let mirrored: Bool; let prompt: String
    func validate() throws {
        guard (0..<100).contains(slotIndex), generation >= 1, designId.range(of: "^HLM-[A-Z0-9-]+$", options: .regularExpression) != nil, sourceHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, ["front", "side", "back", "crown", "nape", "detail"].contains(sourceViewKey), !prompt.isEmpty, prompt.count <= 24000 else { throw HairloomNativeError("invalid-slot") }
        _ = try HairloomProviderEngine.validTypedId(sourceId, prefix: "source")
    }
}
private struct JobPayload: Codable { let sourceId: String; let sourceHash: String; let prompt: String }
private struct SourceRow { let id: String; let hash: String; let view: String; let mime: String; let fileName: String }
private struct OutputRow { let id: String; let mime: String; let fileName: String }
private struct SlotRow { let batchId: String; let slotIndex: Int; let input: SlotInput }

private final class HairloomJournal {
    private var db: OpaquePointer?
    init(url: URL) {
        guard sqlite3_open(url.path, &db) == SQLITE_OK else { fatalError("Hairloom journal unavailable") }
        exec("PRAGMA journal_mode=WAL")
        exec("CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,hash TEXT NOT NULL,view_key TEXT NOT NULL,mime TEXT NOT NULL,file_name TEXT NOT NULL,created INTEGER NOT NULL)")
        exec("CREATE TABLE IF NOT EXISTS outputs(id TEXT PRIMARY KEY,mime TEXT NOT NULL,file_name TEXT NOT NULL,bytes INTEGER NOT NULL,created INTEGER NOT NULL)")
        exec("CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,source_key TEXT NOT NULL,status TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL)")
        exec("CREATE TABLE IF NOT EXISTS slots(batch_id TEXT NOT NULL,slot_index INTEGER NOT NULL,design_id TEXT NOT NULL,generation INTEGER NOT NULL,source_id TEXT NOT NULL,source_hash TEXT NOT NULL,source_view TEXT NOT NULL,mirrored INTEGER NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,output_id TEXT,error TEXT,PRIMARY KEY(batch_id,slot_index))")
        exec("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,batch_id TEXT NOT NULL,slot_index INTEGER NOT NULL,status TEXT NOT NULL,output_id TEXT,error TEXT,status_code INTEGER NOT NULL,attempts INTEGER NOT NULL,created INTEGER NOT NULL)")
    }
    deinit { sqlite3_close(db) }
    func recoverInterrupted() { exec("UPDATE slots SET status='retryable',error='restart-retryable' WHERE status='running'") }
    func insertSource(id: String, hash: String, view: String, mime: String, fileName: String) throws { try run("INSERT INTO sources VALUES(?,?,?,?,?,?)", [id,hash,view,mime,fileName,Date().timeIntervalSince1970]) }
    func source(_ id: String) -> SourceRow? { query("SELECT id,hash,view_key,mime,file_name FROM sources WHERE id=?", [id]).first.map { SourceRow(id: $0[0] as! String, hash: $0[1] as! String, view: $0[2] as! String, mime: $0[3] as! String, fileName: $0[4] as! String) } }
    func deleteSource(_ id: String) { try? run("DELETE FROM sources WHERE id=?", [id]) }
    func sourceInUse(_ id: String) -> Bool { !query("SELECT 1 FROM slots s JOIN batches b ON b.id=s.batch_id WHERE s.source_id=? AND b.status='active' LIMIT 1", [id]).isEmpty }
    func createBatch(_ request: BatchRequest) throws { exec("BEGIN IMMEDIATE"); do { try run("INSERT INTO batches VALUES(?,?,?,?,?)", [request.batchId,request.sourcePhotoKey,"active",0,Date().timeIntervalSince1970]); for slot in request.slots { try run("INSERT INTO slots(batch_id,slot_index,design_id,generation,source_id,source_hash,source_view,mirrored,status) VALUES(?,?,?,?,?,?,?,?,?)", [request.batchId,slot.slotIndex,slot.designId,slot.generation,slot.sourceId,slot.sourceHash,slot.sourceViewKey,slot.mirrored ? 1 : 0,"queued"]) }; exec("COMMIT") } catch { exec("ROLLBACK"); throw error } }
    func resumableBatches() -> [String] { query("SELECT id FROM batches WHERE status='active' AND cancelled=0 ORDER BY created").compactMap { $0[0] as? String } }
    func batchCancelled(_ id: String) -> Bool { (query("SELECT cancelled FROM batches WHERE id=?", [id]).first?[0] as? Int64 ?? 1) != 0 }
    func cleanupExpired(before cutoff: TimeInterval) {
        exec("BEGIN IMMEDIATE")
        do {
            try run("DELETE FROM events WHERE batch_id IN (SELECT id FROM batches WHERE status!='active' AND created<?)", [cutoff])
            try run("DELETE FROM slots WHERE batch_id IN (SELECT id FROM batches WHERE status!='active' AND created<?)", [cutoff])
            try run("DELETE FROM batches WHERE status!='active' AND created<?", [cutoff])
            try run("DELETE FROM outputs WHERE created<? AND id NOT IN (SELECT output_id FROM slots WHERE output_id IS NOT NULL)", [cutoff])
            try run("DELETE FROM sources WHERE created<? AND id NOT IN (SELECT source_id FROM slots)", [cutoff])
            exec("COMMIT")
        } catch {
            exec("ROLLBACK")
        }
    }
    func sourceFileNames() -> Set<String> { fileNames(table: "sources") }
    func outputFileNames() -> Set<String> { fileNames(table: "outputs") }
    func batchIds() -> Set<String> { Set(query("SELECT id FROM batches").compactMap { $0[0] as? String }) }
    private func fileNames(table: String) -> Set<String> { Set(query("SELECT file_name FROM \(table)").compactMap { $0[0] as? String }) }
    func queuedSlots(_ batchId: String, limit: Int) -> [SlotRow] { guard limit > 0 else { return [] }; return query("SELECT slot_index,design_id,generation,source_id,source_hash,source_view,mirrored FROM slots WHERE batch_id=? AND status IN ('queued','retryable') ORDER BY attempts DESC,slot_index LIMIT ?", [batchId,limit]).compactMap { row in guard let index = row[0] as? Int64, let design = row[1] as? String, let generation = row[2] as? Int64, let sourceId = row[3] as? String, let hash = row[4] as? String, let view = row[5] as? String, let mirrored = row[6] as? Int64 else { return nil }; return SlotRow(batchId: batchId, slotIndex: Int(index), input: SlotInput(slotIndex: Int(index), designId: design, generation: Int(generation), sourceId: sourceId, sourceHash: hash, sourceViewKey: view, mirrored: mirrored != 0, prompt: "")) } }
    func markRunning(_ batchId: String, index: Int) -> Int { try? run("UPDATE slots SET status='running',attempts=attempts+1 WHERE batch_id=? AND slot_index=? AND status IN ('queued','retryable')", [batchId,index]); return attempts(batchId, index: index) }
    func attempts(_ batchId: String, index: Int) -> Int { Int(query("SELECT attempts FROM slots WHERE batch_id=? AND slot_index=?", [batchId,index]).first?[0] as? Int64 ?? 0) }
    func retry(_ batchId: String, index: Int) { try? run("UPDATE slots SET status='retryable',error='retryable' WHERE batch_id=? AND slot_index=? AND status='running'", [batchId,index]) }
    func slotRunning(_ batchId: String, index: Int) -> Bool { (query("SELECT status FROM slots WHERE batch_id=? AND slot_index=?", [batchId,index]).first?[0] as? String) == "running" }
    func releaseForCredentialClear() { exec("BEGIN IMMEDIATE"); exec("UPDATE slots SET status='retryable',error='credential-cleared',attempts=CASE WHEN attempts>0 THEN attempts-1 ELSE 0 END WHERE status='running'"); exec("UPDATE slots SET status='retryable',error='credential-cleared' WHERE status='queued'"); exec("COMMIT") }
    func fail(_ batchId: String, index: Int, error: String) { try? run("UPDATE slots SET status='failed',error=? WHERE batch_id=? AND slot_index=?", [error,batchId,index]); finish(batchId) }
    func complete(_ batchId: String, index: Int, outputId: String, mime: String, fileName: String, bytes: Int) { exec("BEGIN IMMEDIATE"); do { try run("INSERT INTO outputs VALUES(?,?,?,?,?)", [outputId,mime,fileName,bytes,Date().timeIntervalSince1970]); try run("UPDATE slots SET status='done',output_id=?,error=NULL WHERE batch_id=? AND slot_index=?", [outputId,batchId,index]); exec("COMMIT") } catch { exec("ROLLBACK") }; finish(batchId) }
    func output(_ id: String) -> OutputRow? { query("SELECT id,mime,file_name FROM outputs WHERE id=?", [id]).first.map { OutputRow(id: $0[0] as! String, mime: $0[1] as! String, fileName: $0[2] as! String) } }
    func event(_ batchId: String, slot: SlotInput, status: String, outputId: String?, error: String?, statusCode: Int, attempts: Int) -> [String: Any] { try? run("INSERT INTO events(batch_id,slot_index,status,output_id,error,status_code,attempts,created) VALUES(?,?,?,?,?,?,?,?)", [batchId,slot.slotIndex,status,outputId as Any,error as Any,statusCode,attempts,Date().timeIntervalSince1970]); let id = sqlite3_last_insert_rowid(db); var value: [String: Any] = ["eventId": id,"batchId": batchId,"slotIndex": slot.slotIndex,"designId": slot.designId,"generation": slot.generation,"sourceHash": slot.sourceHash,"status": status,"attempts": attempts]; if let outputId { value["outputId"] = outputId }; if let error { value["errorType"] = error }; if statusCode != 0 { value["statusCode"] = statusCode }; return value }
    func cancelBatch(_ id: String) { try? run("UPDATE batches SET cancelled=1,status='cancelled',created=? WHERE id=?", [Date().timeIntervalSince1970,id]); try? run("UPDATE slots SET status='cancelled' WHERE batch_id=? AND status IN ('queued','running','retryable')", [id]) }
    func snapshot(_ id: String) -> [String: Any]? {
        guard let batch = query("SELECT source_key,status,cancelled FROM batches WHERE id=?", [id]).first else { return nil }
        let slots = query("SELECT s.slot_index,s.design_id,s.generation,s.source_id,s.source_hash,s.source_view,s.mirrored,s.status,s.attempts,s.output_id,s.error,COALESCE((SELECT MAX(e.id) FROM events e WHERE e.batch_id=s.batch_id AND e.slot_index=s.slot_index),0) FROM slots s WHERE s.batch_id=? ORDER BY s.slot_index", [id]).map { row -> [String: Any] in
            var value: [String: Any] = [
                "slotIndex": Int(row[0] as! Int64),
                "designId": row[1] as! String,
                "generation": Int(row[2] as! Int64),
                "sourceId": row[3] as! String,
                "sourceHash": row[4] as! String,
                "sourceViewKey": row[5] as! String,
                "mirrored": (row[6] as! Int64) != 0,
                "status": row[7] as! String,
                "attempts": Int(row[8] as! Int64)
            ]
            if let output = row[9] as? String { value["outputId"] = output }
            if let error = row[10] as? String { value["errorType"] = error }
            value["lastEventId"] = Int(row[11] as? Int64 ?? 0)
            return value
        }
        return ["batchId": id, "sourcePhotoKey": batch[0] as! String, "status": batch[1] as! String, "cancelled": (batch[2] as! Int64) != 0, "slots": slots]
    }
    func clearCustomerData() { for table in ["events","slots","batches","outputs","sources"] { exec("DELETE FROM \(table)") } }
    private func finish(_ batchId: String) { if (query("SELECT COUNT(*) FROM slots WHERE batch_id=? AND status IN ('queued','running','retryable')", [batchId]).first?[0] as? Int64 ?? 1) == 0 { try? run("UPDATE batches SET status='complete',created=? WHERE id=? AND cancelled=0", [Date().timeIntervalSince1970,batchId]) } }
    private func exec(_ sql: String) { sqlite3_exec(db, sql, nil, nil, nil) }
    private func run(_ sql: String, _ values: [Any] = []) throws { var statement: OpaquePointer?; guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw HairloomNativeError("journal-prepare") }; defer { sqlite3_finalize(statement) }; bind(statement, values); guard sqlite3_step(statement) == SQLITE_DONE else { throw HairloomNativeError("journal-write") } }
    private func query(_ sql: String, _ values: [Any] = []) -> [[Any?]] { var statement: OpaquePointer?; guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { return [] }; defer { sqlite3_finalize(statement) }; bind(statement, values); var rows: [[Any?]] = []; while sqlite3_step(statement) == SQLITE_ROW { rows.append((0..<sqlite3_column_count(statement)).map { column in switch sqlite3_column_type(statement, column) { case SQLITE_INTEGER: return sqlite3_column_int64(statement, column); case SQLITE_FLOAT: return sqlite3_column_double(statement, column); case SQLITE_TEXT: return String(cString: sqlite3_column_text(statement, column)); default: return nil } }) }; return rows }
    private func bind(_ statement: OpaquePointer?, _ values: [Any]) { for (offset, value) in values.enumerated() { let index = Int32(offset + 1); switch value { case let value as String: sqlite3_bind_text(statement, index, value, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)); case let value as Int: sqlite3_bind_int64(statement, index, sqlite3_int64(value)); case let value as Int64: sqlite3_bind_int64(statement, index, value); case let value as Double: sqlite3_bind_double(statement, index, value); default: sqlite3_bind_null(statement, index) } } }
}

private struct HairloomNativeError: Error { let code: String; init(_ code: String) { self.code = code } }
private struct ProviderFailure: Error { let code: String; let statusCode: Int; let pressure: Bool }
